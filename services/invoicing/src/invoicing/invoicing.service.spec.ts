/**
 * INT-106 / INT-128 / INT-428 / INT-440 — TD-2 mapping, BR-09, BR-10 (billing-owned).
 */
import "reflect-metadata";
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  InMemoryOutboxStore,
  OutboxService,
  RecordingTransaction,
  StaticBillingModeResolver,
} from "@intelligent/module-template";
import { StatementStore } from "../domain/statement-store.js";
import { InvoiceStore, type InvoiceWrite } from "../domain/store.js";
import type {
  InvoiceRecord,
  InvoiceStatus,
  PairSettlementInput,
} from "../domain/types.js";
import { isNonRetryableInvoiceError } from "../events/settlement-completed.listener.js";
import {
  MapInvoiceParty,
  type InvoicePartyDetails,
} from "../ports/invoice-party.port.js";
import type { ParticipantsResolverPort } from "../ports/participants-resolver.port.js";
import { NoopParticipantsResolver } from "../ports/participants-resolver.port.js";
import { MapReadiness } from "../ports/readiness.port.js";
import { InvoicingService } from "./invoicing.service.js";
import { StatementsService } from "./statements.service.js";

const PRODUCER_A = "66666666-7777-4888-9999-aaaaaaaaaaaa";
const PRODUCER_B = "77777777-7777-4888-9999-bbbbbbbbbbbb";
const CONSUMER = "11111111-2222-4333-8444-555555555555";

const settlement = (
  over: Partial<PairSettlementInput> = {},
): PairSettlementInput => ({
  settlementId: "s1111111-1111-4111-8111-111111111111",
  runId: "r1111111-1111-4111-8111-111111111111",
  consumerId: CONSUMER,
  producerId: PRODUCER_A,
  tradeIds: ["0xabc"],
  kWh: "10.000",
  energyAmount: "2.00",
  vat: "0.00",
  currency: "EUR",
  rate: "1.0000",
  rateDate: "2026-11-30",
  period: "2026-11",
  periodFrom: "2026-11-01T00:00:00.000Z",
  periodUntil: "2026-12-01T00:00:00.000Z",
  settlementType: "periodic",
  vatRate: 0,
  carriedForwardIn: "0.00",
  communityId: "c0ffee00-1234-4abc-8def-0123456789ab",
  ...over,
});

const party = (
  participantId: string,
  name: string,
  address: string,
  mandate: InvoicePartyDetails["selfBillingMandate"],
): InvoicePartyDetails => ({
  participantId,
  name,
  address,
  selfBillingMandate: mandate,
});

const fixtureParties = (
  over: Map<string, InvoicePartyDetails> = new Map(),
): MapInvoiceParty => {
  const map = new Map<string, InvoicePartyDetails>([
    [
      PRODUCER_A,
      party(PRODUCER_A, "Paul Nguyen", "1 Fixture Lane", {
        termsVersion: "v1",
        acceptedAt: null,
      }),
    ],
    [
      PRODUCER_B,
      party(PRODUCER_B, "Other Producer", "3 Fixture Lane", {
        termsVersion: "v1",
        acceptedAt: null,
      }),
    ],
    [
      CONSUMER,
      party(CONSUMER, "Hugo Petit", "2 Fixture Lane", null),
    ],
  ]);
  for (const [id, details] of over) map.set(id, details);
  return new MapInvoiceParty(map);
};

describe("InvoicingService", () => {
  let store: InvoiceStore;
  let outboxStore: InMemoryOutboxStore;
  let service: InvoicingService;

  const statementsFor = () =>
    new StatementsService(
      store,
      new StatementStore(),
      new OutboxService(outboxStore),
      new NoopParticipantsResolver(),
    );

  const buildService = (
    over: {
      readiness?: MapReadiness;
      parties?: MapInvoiceParty;
      renderer?: (invoice: InvoiceRecord) => Promise<Uint8Array>;
      outbox?: OutboxService;
      billingMode?: StaticBillingModeResolver;
    } = {},
  ) =>
    new InvoicingService(
      store,
      over.outbox ?? new OutboxService(outboxStore),
      over.readiness ??
        new MapReadiness(new Map([[PRODUCER_A, true], [PRODUCER_B, true]])),
      new NoopParticipantsResolver(),
      statementsFor(),
      over.billingMode,
      over.renderer,
      over.parties ?? fixtureParties(),
    );

  beforeEach(() => {
    store = new InvoiceStore();
    outboxStore = new InMemoryOutboxStore();
    service = buildService();
  });

  it("REQ-043: InvoiceIssued carries community mode", async () => {
    const liveOutbox = new InMemoryOutboxStore();
    const liveService = buildService({
      outbox: new OutboxService(liveOutbox),
      billingMode: new StaticBillingModeResolver("live"),
    });
    await liveService.createFromSettlement(settlement());
    const events = await liveOutbox.list();
    const issued = events.find((e) => e.event.type === "InvoiceIssued");
    expect(issued?.event.billingMode).toBe("live");
  });

  it("REQ-059: a settlement without a period leaves the invoice period empty", async () => {
    const invoice = await service.createFromSettlement(
      settlement({ period: undefined, periodFrom: undefined, periodUntil: undefined }),
    );
    expect(invoice).toMatchObject({ period: "", periodFrom: "", periodUntil: "" });
  });

  it("maps a pair settlement to a billing-owned invoice (TD-2, BR-10, A6)", async () => {
    const invoice = await service.createFromSettlement(settlement());
    expect(invoice).not.toBeNull();
    expect(invoice!.legalNumber).toBe("SB-66666666-000001");
    expect(invoice!.status).toBe("Open");
    expect(invoice!.total).toBe("2.00");
    expect(invoice).not.toHaveProperty("stripeInvoiceId");
    // REQ-059 — run and period kept on the invoice for the statements.
    expect(invoice).toMatchObject({
      runId: "r1111111-1111-4111-8111-111111111111",
      period: "2026-11",
      periodFrom: "2026-11-01T00:00:00.000Z",
      periodUntil: "2026-12-01T00:00:00.000Z",
    });

    const again = await service.createFromSettlement(settlement());
    expect(again!.invoiceId).toBe(invoice!.invoiceId);

    const events = await outboxStore.list();
    const issued = events.find((e) => e.event.type === "InvoiceIssued");
    expect(issued?.event.data).toMatchObject({
      settlementId: "s1111111-1111-4111-8111-111111111111",
      billingPeriodFrom: "2026-11-01T00:00:00.000Z",
      billingPeriodUntil: "2026-12-01T00:00:00.000Z",
      settlementType: "periodic",
      totalEnergyKWh: "10.000",
      vatRate: 0,
      carriedForwardAmount: "0.00",
      exchangeRate: null,
    });
    expect(JSON.stringify(issued?.event.data)).not.toMatch(/legalNumber/);
  });

  it("UAT-053 two invoices of one producer get consecutive numbers, another producer starts at 1", async () => {
    const first = await service.createFromSettlement(settlement());
    const second = await service.createFromSettlement(
      settlement({ settlementId: "s2222222-2222-4222-8222-222222222222" }),
    );
    const third = await service.createFromSettlement(
      settlement({
        settlementId: "s3333333-3333-4333-8333-333333333333",
        producerId: PRODUCER_B,
      }),
    );
    expect(first!.legalNumber).toBe("SB-66666666-000001");
    expect(second!.legalNumber).toBe("SB-66666666-000002");
    expect(third!.legalNumber).toBe("SB-77777777-000001");
  });

  it("REQ-042 a failed render leaves no gap", async () => {
    let failOnce = true;
    const { renderInvoicePdf } = await import("../pdf/invoice-pdf.renderer.js");
    const outbox = new OutboxService(outboxStore);
    const failing = buildService({
      outbox,
      renderer: async (invoice) => {
        if (failOnce) {
          failOnce = false;
          throw new Error("renderer failed");
        }
        return renderInvoicePdf(invoice);
      },
    });
    // Fake pool so RecordingTransaction restores the in-memory snapshot on throw.
    const tx = new RecordingTransaction<InvoiceWrite>(
      store,
      outbox,
      async () => ({
        query: async () => ({ rows: [] }),
        release: () => undefined,
      }),
      async () => undefined,
    );
    failing.useTransaction(tx);

    await expect(failing.createFromSettlement(settlement())).rejects.toThrow(
      /renderer failed/,
    );
    expect(store.findBySettlement(settlement().settlementId)).toBeUndefined();

    const issued = await failing.createFromSettlement(settlement());
    expect(issued!.legalNumber).toBe("SB-66666666-000001");
  });

  it("UAT-050 stores the PDF and its sha256 at issue", async () => {
    const invoice = (await service.createFromSettlement(settlement()))!;
    const doc = store.getDocument(invoice.invoiceId);
    expect(doc).toBeDefined();
    expect(doc!.subarray(0, 4).toString("utf8")).toBe("%PDF");
    expect(invoice.document?.sha256).toBe(
      createHash("sha256").update(doc!).digest("hex"),
    );
  });

  it("REQ-004 UAT-004 issues amounts with tariff and flags tariffApplied", async () => {
    const invoice = await service.createFromSettlement(
      settlement({
        energyAmount: "2.00",
        gridFeeAmount: "0.45",
        levyAmount: "0.10",
        taxAmount: "0.05",
        vat: "0.26",
        tariffId: "tariff-uat004-2026",
      }),
    );
    expect(invoice!.amounts?.total).toBe("2.86");
    const events = await outboxStore.list();
    const issued = events.find((e) => e.event.type === "InvoiceIssued");
    expect(issued?.event.data).toMatchObject({
      amounts: {
        energy: "2.00",
        gridFee: "0.45",
        levy: "0.10",
        tax: "0.05",
        vat: "0.26",
        total: "2.86",
      },
      tariffApplied: true,
    });
    expect(JSON.stringify(issued?.event.data)).not.toMatch(/legalNumber/);
    const publicView = await service.getPublicInvoiceForParticipant(
      invoice!.invoiceId,
      CONSUMER,
    );
    expect(publicView.amounts).toEqual({
      energy: "2.00",
      gridFee: "0.45",
      levy: "0.10",
      tax: "0.05",
      vat: "0.26",
      total: "2.86",
    });
    expect(publicView.tariffApplied).toBe(true);
  });

  it("NFR-015 InvoiceIssued carries no names", async () => {
    await service.createFromSettlement(settlement());
    const events = await outboxStore.list();
    const issued = events.find((e) => e.event.type === "InvoiceIssued");
    expect(JSON.stringify(issued?.event)).not.toContain("Paul Nguyen");
    expect(JSON.stringify(issued?.event)).not.toContain("Hugo Petit");
  });

  it("BR-09 REQ-050 holds the invoice until the producer mandate exists", async () => {
    service = buildService({
      parties: fixtureParties(
        new Map([
          [
            PRODUCER_A,
            party(PRODUCER_A, "Paul Nguyen", "1 Fixture Lane", null),
          ],
        ]),
      ),
    });
    await expect(service.createFromSettlement(settlement())).rejects.toThrow(
      /producer not ready/,
    );
    try {
      await service.createFromSettlement(settlement());
    } catch (err) {
      expect(isNonRetryableInvoiceError(err as Error)).toBe(false);
    }
  });

  it("holds invoicing until producer is ready (BR-09)", async () => {
    service = buildService({ readiness: new MapReadiness(new Map()) });
    await expect(service.createFromSettlement(settlement())).rejects.toThrow(
      /not[_ ]ready/,
    );
  });

  it("exposes per-trade lines to both parties and sums energy, VAT and total (INT-354 / REQ-007 / UAT-007)", async () => {
    const lines = [
      {
        tradeId: "t1",
        deliveryStart: "2026-11-01T00:00:00Z",
        deliveryEnd: "2026-11-01T00:15:00Z",
        kWh: "10.000",
        pricePerKWh: "0.20",
        amount: "2.00",
      },
      {
        tradeId: "t2",
        deliveryStart: "2026-11-01T00:15:00Z",
        deliveryEnd: "2026-11-01T00:30:00Z",
        kWh: "5.000",
        pricePerKWh: "0.20",
        amount: "1.00",
      },
    ];
    const created = await service.createFromSettlement(
      settlement({ energyAmount: "3.00", vat: "0.60", lines }),
    );
    expect(created!.total).toBe("3.60");
    const viewed = await service.getPublicInvoiceForParticipant(
      created!.invoiceId,
      created!.consumerId,
    );
    expect(viewed.lines).toEqual(lines);
    const amounts = viewed.amounts as { energy: string; vat: string; total: string };
    expect((Number(amounts.energy) + Number(amounts.vat)).toFixed(2)).toBe(amounts.total);
    expect(JSON.stringify(viewed)).not.toMatch(/grid fee/i);
    const asProducer = await service.getPublicInvoiceForParticipant(
      created!.invoiceId,
      created!.producerId,
    );
    expect(asProducer.lines).toEqual(lines);
  });

  it("skips zero-amount carry-forward settlements", async () => {
    const result = await service.createFromSettlement(
      settlement({ energyAmount: "0.00" }),
    );
    expect(result).toBeNull();
  });

  it("marks open invoices overdue (REQ-044)", async () => {
    const invoice = (await service.createFromSettlement(settlement()))!;
    store.put({ ...invoice, dueDate: "2020-01-01" });
    const result = await service.markOverdue("2026-11-01");
    expect(result.marked).toBe(1);
    expect(service.getInvoice(invoice.invoiceId).status).toBe("Overdue");
  });

  it("rejects markOverdue without asOf", async () => {
    await expect(service.markOverdue("")).rejects.toThrow(/asOf/);
  });

  it("rejects unsupported manual status", async () => {
    const invoice = (await service.createFromSettlement(settlement()))!;
    await expect(
      service.setInvoiceStatus(invoice.invoiceId, {
        status: "Unknown" as InvoiceStatus,
        reason: "test",
        actorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      }),
    ).rejects.toThrow(/unsupported status/);
  });

  it("ignores non-succeeded payment status updates", async () => {
    const invoice = (await service.createFromSettlement(settlement()))!;
    const next = await service.applyPaymentStatusChanged({
      invoiceId: invoice.invoiceId,
      paymentId: "pay-fail",
      status: "failed",
    });
    expect(next).toBeUndefined();
    expect(service.getInvoice(invoice.invoiceId).status).toBe("Open");
  });

  it("UAT-055 — manager sets Paid with reason and audit trail (REQ-044)", async () => {
    const invoice = (await service.createFromSettlement(settlement()))!;
    const actor = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const updated = await service.setInvoiceStatus(invoice.invoiceId, {
      status: "Paid",
      reason: "paid outside the platform",
      actorId: actor,
    });
    expect(updated.status).toBe("Paid");
    const audit = service.listStatusAudit(invoice.invoiceId);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actorId: actor,
      status: "Paid",
      reason: "paid outside the platform",
      source: "manual",
    });
    const events = await outboxStore.list();
    expect(events.some((e) => e.event.type === "InvoiceStatusChanged")).toBe(
      true,
    );
    expect(
      events.some((e) => e.event.type === "AuditableActionPerformed"),
    ).toBe(true);
    await expect(
      service.setInvoiceStatus(invoice.invoiceId, {
        status: "Paid",
        reason: "   ",
        actorId: actor,
      }),
    ).rejects.toThrow(/reason/);
  });

  it("INT-270 — PaymentStatusChanged succeeded marks invoice Paid", async () => {
    const invoice = (await service.createFromSettlement(settlement()))!;
    expect(invoice.status).toBe("Open");
    const next = await service.applyPaymentStatusChanged({
      invoiceId: invoice.invoiceId,
      paymentId: "pay-1",
      status: "succeeded",
    });
    expect(next?.status).toBe("Paid");
    expect(service.listStatusAudit(invoice.invoiceId)[0]?.source).toBe("payment");
    const again = await service.applyPaymentStatusChanged({
      invoiceId: invoice.invoiceId,
      paymentId: "pay-1",
      status: "succeeded",
    });
    expect(again?.status).toBe("Paid");
    expect(
      service.listStatusAudit(invoice.invoiceId).filter((a) => a.status === "Paid"),
    ).toHaveLength(1);
  });

  it("INT-238 — getInvoiceBySettlement returns the row", async () => {
    const invoice = (await service.createFromSettlement(settlement()))!;
    expect(service.getInvoiceBySettlement(invoice.settlementId).invoiceId).toBe(
      invoice.invoiceId,
    );
    expect(service.getInvoice(invoice.invoiceId).legalNumber).toBe(
      "SB-66666666-000001",
    );
  });

  it("INT-236 — listInvoices resolves IdP sub to participantId", async () => {
    const invoice = (await service.createFromSettlement(settlement()))!;
    const idp: ParticipantsResolverPort = {
      resolveByIdpSub: async (sub) =>
        sub === "c1a55e01-0001-4000-8000-000000000001"
          ? {
              participantId: "11111111-2222-4333-8444-555555555555",
              communityId: "c0ffee00-1234-4abc-8def-0123456789ab",
            }
          : null,
    };
    const withIdp = new InvoicingService(
      store,
      new OutboxService(outboxStore),
      new MapReadiness(new Map([[PRODUCER_A, true]])),
      idp,
      statementsFor(),
      undefined,
      undefined,
      fixtureParties(),
    );
    const listed = await withIdp.listInvoicesForParticipant(
      "c1a55e01-0001-4000-8000-000000000001",
    );
    expect(listed.some((r) => r.invoiceId === invoice.invoiceId)).toBe(true);
  });

  it("REQ-013 / INT-275 — erasure retains invoices and emits ErasureCompleted", async () => {
    const invoice = (await service.createFromSettlement(settlement()))!;
    const beforeCount = store.listByParticipant(
      "11111111-2222-4333-8444-555555555555",
    ).length;
    expect(beforeCount).toBeGreaterThan(0);

    const result = await service.applyErasureRequested({
      requestId: "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff",
      participantId: "11111111-2222-4333-8444-555555555555",
    });
    expect(result.invoicesRetained).toBe(beforeCount);
    expect(store.get(invoice.invoiceId)?.invoiceId).toBe(invoice.invoiceId);

    const events = await outboxStore.list();
    const completed = events.find((e) => e.event.type === "ErasureCompleted");
    expect(completed?.event.producer).toBe("AC-06");
    expect(completed?.event.data).toMatchObject({
      requestId: "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff",
      module: "AC-06",
      result: "completed",
    });
  });

  it("UAT-078 manager sends a reminder on an overdue invoice", async () => {
    const invoice = (await service.createFromSettlement(settlement()))!;
    store.put({ ...invoice, status: "Overdue", dueDate: "2026-11-01" });
    const actor = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const result = await service.sendReminder(invoice.invoiceId, {
      actorId: actor,
      communityId: "c0ffee00-1234-4abc-8def-0123456789ab",
      trigger: "manual",
    });
    expect(result).toEqual({ invoiceId: invoice.invoiceId, reminderCount: 1 });
    const events = await outboxStore.list();
    const reminder = events.find(
      (e) => e.event.type === "PaymentReminderRequested",
    );
    expect(reminder?.event.data).toMatchObject({
      invoiceId: invoice.invoiceId,
      trigger: "manual",
      reminderNumber: 1,
      recipientId: "11111111-2222-4333-8444-555555555555",
    });
    const audit = events.find(
      (e) =>
        e.event.type === "AuditableActionPerformed" &&
        (e.event.data as { action?: string }).action ===
          "invoice.reminder.manual",
    );
    expect(audit?.event.data).toMatchObject({
      actorId: actor,
      action: "invoice.reminder.manual",
    });
  });

  it("REQ-061 refuses a reminder on a Paid invoice", async () => {
    const invoice = (await service.createFromSettlement(settlement()))!;
    await service.setInvoiceStatus(invoice.invoiceId, {
      status: "Paid",
      reason: "already settled",
      actorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });
    await expect(
      service.sendReminder(invoice.invoiceId, {
        actorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        trigger: "manual",
      }),
    ).rejects.toThrow(/cannot be reminded|Conflict/);
  });

  it("REQ-049 manager of another community gets 404 on reminder", async () => {
    const invoice = (await service.createFromSettlement(settlement()))!;
    await expect(
      service.sendReminder(invoice.invoiceId, {
        actorId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        communityId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        trigger: "manual",
      }),
    ).rejects.toThrow(/Unknown invoice/);
  });

  it("REQ-061 scheduled reminders every 7 days, at most 3", async () => {
    const invoice = (await service.createFromSettlement(settlement()))!;
    store.put({
      ...invoice,
      status: "Overdue",
      dueDate: "2026-12-01",
      reminders: [],
    });
    expect((await service.sendDueReminders("2026-12-02")).sent).toBe(1);
    expect((await service.sendDueReminders("2026-12-05")).sent).toBe(0);
    expect((await service.sendDueReminders("2026-12-09")).sent).toBe(1);
    expect((await service.sendDueReminders("2026-12-16")).sent).toBe(1);
    expect((await service.sendDueReminders("2026-12-23")).sent).toBe(0);
    expect(store.get(invoice.invoiceId)?.reminders).toHaveLength(3);
    expect(
      store.get(invoice.invoiceId)?.reminders.every((r) => r.trigger === "scheduled"),
    ).toBe(true);
  });

  it("REQ-013: lists invoices where the participant is issuer or addressee", async () => {
    // 2 as producer (issuer) + 1 as consumer (addressee), ordered by period.
    const P = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const row = (
      invoiceId: string,
      consumerId: string,
      producerId: string,
      period: string,
    ): InvoiceRecord => ({
      invoiceId,
      settlementId: `s-${invoiceId}`,
      runId: "R-dsar",
      period,
      periodFrom: `${period}-01T00:00:00.000Z`,
      periodUntil: `${period}-28T00:00:00.000Z`,
      producerId,
      consumerId,
      currency: "EUR",
      status: "Open",
      total: "10.00",
      tradeIds: [],
      lines: [],
      legalNumber: producerId === P ? `SB-${period}` : null,
      energyAmount: "10.00",
      vatAmount: "0.00",
      dueDate: `${period}-28`,
      communityId: "c0ffee00-1234-4abc-8def-0123456789ab",
      statusAudit: [],
      reminders: [],
    });
    store.put(row("inv-p1", "cccc1111-1111-4111-8111-111111111111", P, "2026-01"));
    store.put(row("inv-p2", "cccc2222-2222-4222-8222-222222222222", P, "2026-02"));
    store.put(row("inv-c1", P, "dddd3333-3333-4333-8333-333333333333", "2026-03"));

    const rows = await service.listForParticipant(P);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.partyRole)).toEqual([
      "issuer",
      "issuer",
      "addressee",
    ]);
    expect(rows.map((r) => r.period)).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(rows[0]).toMatchObject({
      invoiceId: "inv-p1",
      legalNumber: "SB-2026-01",
      total: "10.00",
      currency: "EUR",
      status: "Open",
      issuedAt: null,
    });
  });
});
