/**
 * REQ-059 / REQ-054 / UAT-076 / NFR-015 — one statement per participant and
 * period, issued after each billing run.
 */
import "reflect-metadata";
import { beforeEach, describe, expect, it } from "vitest";
import {
  InMemoryOutboxStore,
  OutboxService,
  type OutboxRow,
} from "@intelligent/module-template";
import { StatementStore } from "../domain/statement-store.js";
import { InvoiceStore } from "../domain/store.js";
import type { InvoiceRecord } from "../domain/types.js";
import type { ParticipantsResolverPort } from "../ports/participants-resolver.port.js";
import { NoopParticipantsResolver } from "../ports/participants-resolver.port.js";
import { MapReadiness } from "../ports/readiness.port.js";
import { InvoicingService } from "./invoicing.service.js";
import { StatementsService } from "./statements.service.js";

const COM = "c0ffee00-1234-4abc-8def-0123456789ab";
const OCT = {
  period: "2026-10",
  periodFrom: "2026-10-01T00:00:00.000Z",
  periodUntil: "2026-11-01T00:00:00.000Z",
};

const invoice = (
  invoiceId: string,
  consumerId: string,
  producerId: string,
  total: string,
  over: Partial<InvoiceRecord> = {},
): InvoiceRecord => ({
  invoiceId,
  settlementId: `s-${invoiceId}`,
  runId: "R1",
  ...OCT,
  producerId,
  consumerId,
  currency: "EUR",
  status: "Open",
  total,
  tradeIds: [],
  lines: [],
  legalNumber: null,
  energyAmount: total,
  vatAmount: "0.00",
  dueDate: "2026-11-15",
  communityId: COM,
  statusAudit: [],
  reminders: [],
  ...over,
});

describe("StatementsService (REQ-059)", () => {
  let invoices: InvoiceStore;
  let store: StatementStore;
  let outboxStore: InMemoryOutboxStore;
  let svc: StatementsService;

  const issued = async (): Promise<OutboxRow[]> =>
    (await outboxStore.list()).filter((r) => r.event.type === "StatementIssued");

  const build = (resolver: ParticipantsResolverPort = new NoopParticipantsResolver()) =>
    new StatementsService(invoices, store, new OutboxService(outboxStore), resolver);

  beforeEach(() => {
    invoices = new InvoiceStore();
    store = new StatementStore();
    outboxStore = new InMemoryOutboxStore();
    // Run R1, period 2026-10: A→P 12.00, B→P 8.50, P→C 6.25 (consumer → producer).
    invoices.put(invoice("i1", "A", "P", "12.00"));
    invoices.put(invoice("i2", "B", "P", "8.50"));
    invoices.put(invoice("i3", "P", "C", "6.25"));
    svc = build();
  });

  it("UAT-076: one statement per participant for the run, with all their invoices", async () => {
    const rows = await svc.issueStatementsForRun("R1");
    const p = rows.find((r) => r.participantId === "P")!;
    expect(p).toMatchObject({
      communityId: COM,
      ...OCT,
      currency: "EUR",
      totalSold: "20.50",
      totalBought: "6.25",
      netBalance: "14.25",
      direction: "to_receive",
      invoiceIds: ["i1", "i2", "i3"],
      revision: 1,
      status: "Open",
    });
    expect(rows.map((r) => r.participantId).sort()).toEqual(["A", "B", "C", "P"]);
    expect(rows.find((r) => r.participantId === "A")).toMatchObject({
      totalBought: "12.00",
      netBalance: "-12.00",
      direction: "to_pay",
      invoiceIds: ["i1"],
    });
    expect(await issued()).toHaveLength(4);
    expect(store.find("P", COM, "2026-10")?.statementId).toBe(p.statementId);
  });

  it("REQ-059: a final run in the same period revises the statement instead of creating a second one", async () => {
    await svc.issueStatementsForRun("R1");
    const first = store.find("P", COM, "2026-10")!;
    invoices.put(invoice("i4", "A", "P", "1.00", { runId: "R2" }));

    const rows = await svc.issueStatementsForRun("R2");

    const p = store.find("P", COM, "2026-10")!;
    expect(p.statementId).toBe(first.statementId);
    expect(p.revision).toBe(2);
    expect(p.totalSold).toBe("21.50");
    expect(p.invoiceIds).toHaveLength(4);
    expect(p.issuedAt).toBe(first.issuedAt);
    expect(rows.map((r) => r.participantId).sort()).toEqual(["A", "P"]);
    expect(store.listByParticipant(["P"])).toHaveLength(1);
    // B and C are not on R2: their statements stay at revision 1.
    expect(store.find("B", COM, "2026-10")!.revision).toBe(1);
    expect(await issued()).toHaveLength(6);
  });

  it("re-issuing the same run is idempotent (no new revision, no event)", async () => {
    await svc.issueStatementsForRun("R1");
    const before = (await outboxStore.list()).length;
    const rows = await svc.issueStatementsForRun("R1");
    expect((await outboxStore.list()).length).toBe(before);
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.revision === 1)).toBe(true);
  });

  it("NFR-015: StatementIssued carries identifiers and amounts only", async () => {
    await svc.issueStatementsForRun("R1");
    const [first] = await issued();
    expect(first!.aggregateType).toBe("Statement");
    expect(first!.event).toMatchObject({
      type: "StatementIssued",
      producer: "AC-06",
      communityId: COM,
    });
    expect(first!.aggregateId).toBe(
      (first!.event.data as { statementId: string }).statementId,
    );
    expect(Object.keys(first!.event.data).sort()).toEqual([
      "currency",
      "invoiceIds",
      "netBalance",
      "participantId",
      "period",
      "periodFrom",
      "periodUntil",
      "revision",
      "statementId",
      "status",
      "totalBought",
      "totalSold",
    ]);
  });

  it("separates periods and communities, and ignores invoices of other runs", async () => {
    invoices.put(invoice("n1", "A", "P", "3.00", {
      runId: "R3",
      period: "2026-11",
      periodFrom: "2026-11-01T00:00:00.000Z",
      periodUntil: "2026-12-01T00:00:00.000Z",
    }));
    invoices.put(invoice("x1", "A", "P", "4.00", { runId: "R3", communityId: "other" }));

    const rows = await svc.issueStatementsForRun("R3");

    const nov = rows.find((r) => r.participantId === "P" && r.period === "2026-11")!;
    expect(nov.invoiceIds).toEqual(["n1"]);
    expect(nov.periodFrom).toBe("2026-11-01T00:00:00.000Z");
    expect(rows.find((r) => r.communityId === "other" && r.participantId === "P")!.invoiceIds)
      .toEqual(["x1"]);
    // x1 is on R3 in October of another community: COM's October statement is untouched.
    expect(store.find("P", COM, "2026-10")).toBeUndefined();
    expect(rows).toHaveLength(4);
  });

  it("an unknown run issues nothing", async () => {
    expect(await svc.issueStatementsForRun("missing")).toEqual([]);
    expect(await outboxStore.list()).toHaveLength(0);
  });

  it("covers the widest period bounds of the merged invoices", async () => {
    invoices.put(invoice("f1", "A", "P", "1.00", {
      runId: "R2",
      periodFrom: "2026-10-01T00:00:00.000Z",
      periodUntil: "2026-10-20T00:00:00.000Z",
    }));
    invoices.put(invoice("f0", "D", "P", "1.00", {
      runId: "R2",
      periodFrom: "2026-09-30T00:00:00.000Z",
      periodUntil: "2026-10-20T00:00:00.000Z",
    }));
    await svc.issueStatementsForRun("R2");
    const p = store.find("P", COM, "2026-10")!;
    expect(p.periodFrom).toBe("2026-09-30T00:00:00.000Z");
    expect(p.periodUntil).toBe("2026-11-01T00:00:00.000Z");
  });

  it("runs inside the configured transaction", async () => {
    let runs = 0;
    svc.useTransaction({
      run: async <T>(fn: () => Promise<T> | T): Promise<T> => {
        runs += 1;
        return fn();
      },
    } as never);
    await svc.issueStatementsForRun("R1");
    expect(runs).toBe(1);
  });

  it("REQ-010: listForParticipant returns the caller's statements (raw sub and resolved id)", async () => {
    invoices.put(invoice("k1", "sub-K", "P", "2.00", { runId: "R2" }));
    svc = build({
      resolveByIdpSub: async (sub: string) =>
        sub === "idp-P" ? { participantId: "P", communityId: COM } : null,
    } as ParticipantsResolverPort);
    await svc.issueStatementsForRun("R1");
    await svc.issueStatementsForRun("R2");

    const mine = await svc.listForParticipant("idp-P");
    expect(mine.map((s) => s.participantId)).toEqual(["P"]);
    expect((await svc.listForParticipant("sub-K")).map((s) => s.participantId)).toEqual([
      "sub-K",
    ]);
  });

  describe("status follows invoice status (REQ-059 / REQ-044)", () => {
    let invoicing: InvoicingService;

    const statusChanged = async (): Promise<OutboxRow[]> =>
      (await outboxStore.list()).filter((r) => r.event.type === "StatementStatusChanged");

    beforeEach(() => {
      invoicing = new InvoicingService(
        invoices,
        new OutboxService(outboxStore),
        new MapReadiness(new Map()),
        new NoopParticipantsResolver(),
        svc,
      );
    });

    it("REQ-059: paying one of P's three invoices makes both statements PartiallyPaid / Paid", async () => {
      await svc.issueStatementsForRun("R1");
      // i1 is A → P 12.00.
      await invoicing.applyPaymentStatusChanged({
        invoiceId: "i1",
        paymentId: "pay_1",
        status: "succeeded",
      });

      expect(store.find("P", COM, "2026-10")!.status).toBe("PartiallyPaid");
      expect(store.find("A", COM, "2026-10")!.status).toBe("Paid");
      expect(store.find("B", COM, "2026-10")!.status).toBe("Open");
      const changed = await statusChanged();
      expect(
        changed.map((e) => (e.event.data as { participantId: string }).participantId).sort(),
      ).toEqual(["A", "P"]);
      const a = store.find("A", COM, "2026-10")!;
      expect(changed.find((e) => e.aggregateId === a.statementId)!.event).toMatchObject({
        type: "StatementStatusChanged",
        producer: "AC-06",
        communityId: COM,
        data: { statementId: a.statementId, participantId: "A", period: "2026-10", status: "Paid" },
      });
      // NFR-015 — identifiers and status only.
      expect(Object.keys(changed[0]!.event.data).sort()).toEqual([
        "participantId",
        "period",
        "statementId",
        "status",
      ]);
      // A status change is not a new revision.
      expect(a.revision).toBe(1);
    });

    it("no StatementStatusChanged when the derived status is unchanged", async () => {
      await svc.issueStatementsForRun("R1");
      await invoicing.markOverdue("2026-12-01");
      expect(store.find("P", COM, "2026-10")!.status).toBe("Overdue");
      const after = (await statusChanged()).length;
      expect(after).toBe(4);

      // REQ-044 — the manual change is still audited on the invoice.
      await invoicing.setInvoiceStatus("i3", {
        status: "Overdue",
        reason: "still late",
        actorId: "m1",
      });
      expect((await statusChanged()).length).toBe(after);
      expect(invoicing.listStatusAudit("i3").at(-1)).toMatchObject({
        status: "Overdue",
        source: "manual",
      });
    });

    it("an invoice not on any statement changes nothing", async () => {
      await invoicing.applyPaymentStatusChanged({
        invoiceId: "i1",
        paymentId: "pay_1",
        status: "succeeded",
      });
      expect(await statusChanged()).toHaveLength(0);
      expect(store.list()).toHaveLength(0);
    });

    it("REQ-059: voiding an invoice revises the totals and the status", async () => {
      await svc.issueStatementsForRun("R1");
      await invoicing.setInvoiceStatus("i1", { status: "Void", reason: "error", actorId: "m1" });

      const a = store.find("A", COM, "2026-10")!;
      expect(a).toMatchObject({ status: "Void", totalBought: "0.00", revision: 2 });
      const p = store.find("P", COM, "2026-10")!;
      expect(p).toMatchObject({ status: "Open", totalSold: "8.50", revision: 2 });
      expect(p.invoiceIds).toEqual(["i1", "i2", "i3"]);
      expect(await issued()).toHaveLength(6);
      expect(
        (await statusChanged()).map((e) => (e.event.data as { participantId: string }).participantId),
      ).toEqual(["A"]);
    });

    it("recomputes inside the configured transaction", async () => {
      await svc.issueStatementsForRun("R1");
      let runs = 0;
      svc.useTransaction({
        run: async <T>(fn: () => Promise<T> | T): Promise<T> => {
          runs += 1;
          return fn();
        },
      } as never);
      await svc.recomputeForInvoice("i1");
      expect(runs).toBe(1);
    });
  });

  it("listInternal returns statements with invoice summaries, filtered by period", async () => {
    await svc.issueStatementsForRun("R1");
    const all = await svc.listInternal("P");
    expect(all).toHaveLength(1);
    expect(all[0]!.invoices).toEqual([
      { invoiceId: "i1", producerId: "P", consumerId: "A", total: "12.00", status: "Open" },
      { invoiceId: "i2", producerId: "P", consumerId: "B", total: "8.50", status: "Open" },
      { invoiceId: "i3", producerId: "C", consumerId: "P", total: "6.25", status: "Open" },
    ]);
    expect(await svc.listInternal("P", "2026-10")).toHaveLength(1);
    expect(await svc.listInternal("P", "2026-09")).toHaveLength(0);
  });
});
