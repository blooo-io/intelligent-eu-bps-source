/**
 * INT-108 — AC-08 reconciliation (REQ-041, UAT-052, scenario S5).
 */
import "reflect-metadata";
import { beforeEach, describe, expect, it } from "vitest";
import {
  InMemoryOutboxStore,
  OutboxService,
} from "@intelligent/module-template";
import { ReconciliationStore } from "../domain/store.js";
import { ReconciliationService } from "./reconciliation.service.js";

const COMMUNITY = "c0ffee00-1234-4abc-8def-0123456789ab";
const INV_OK = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const INV_MISSING = "bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const INV_FAILED = "cccccccc-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const INV_AMOUNT = "dddddddd-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const MARKET_S5 = "mkt-s5-missing-trade";

describe("ReconciliationService", () => {
  let store: ReconciliationStore;
  let outboxStore: InMemoryOutboxStore;
  let service: ReconciliationService;

  beforeEach(() => {
    store = new ReconciliationStore();
    outboxStore = new InMemoryOutboxStore();
    service = new ReconciliationService(
      store,
      new OutboxService(outboxStore),
    );
  });

  function seedUat052Fixture(): void {
    // Completed payment matching invoice.
    service.projectInvoice({
      invoiceId: INV_OK,
      total: "10.00",
      currency: "EUR",
      communityId: COMMUNITY,
      status: "Open",
    });
    service.projectPayment({
      paymentId: "pay-ok",
      invoiceId: INV_OK,
      amount: "10.00",
      currency: "EUR",
      status: "succeeded",
      communityId: COMMUNITY,
    });

    // Missing payment.
    service.projectInvoice({
      invoiceId: INV_MISSING,
      total: "5.00",
      currency: "EUR",
      communityId: COMMUNITY,
      status: "Open",
    });

    // Failed payment.
    service.projectInvoice({
      invoiceId: INV_FAILED,
      total: "3.00",
      currency: "EUR",
      communityId: COMMUNITY,
      status: "Open",
    });
    service.projectPayment({
      paymentId: "pay-fail",
      invoiceId: INV_FAILED,
      amount: "3.00",
      currency: "EUR",
      status: "failed",
      communityId: COMMUNITY,
    });

    // Amount mismatch.
    service.projectInvoice({
      invoiceId: INV_AMOUNT,
      total: "8.00",
      currency: "EUR",
      communityId: COMMUNITY,
      status: "Open",
    });
    service.projectPayment({
      paymentId: "pay-amt",
      invoiceId: INV_AMOUNT,
      amount: "7.50",
      currency: "EUR",
      status: "succeeded",
      communityId: COMMUNITY,
    });

    // S5 — market one short of ClearingResult.numTrades / tradedQuantity.
    service.projectMarket({
      marketId: MARKET_S5,
      communityId: COMMUNITY,
      expectedNumTrades: 2,
      expectedTradedQuantityKWh: "8.00",
      actualNumTrades: 1,
      actualTradedQuantityKWh: "4.00",
    });
  }

  it("flags missing, failed and amount-mismatched payments (REQ-041, UAT-052)", async () => {
    seedUat052Fixture();
    await service.reconcile({ scope: "invoice", communityId: COMMUNITY });

    const discrepancies = service.listDiscrepancies(COMMUNITY);
    const invoiceOnes = discrepancies.filter((d) => d.scope === "invoice");
    expect(invoiceOnes.length).toBe(3);

    expect(
      invoiceOnes.some(
        (d) =>
          d.expected.includes(INV_MISSING) && d.actual.includes("missing"),
      ),
    ).toBe(true);
    expect(
      invoiceOnes.some(
        (d) =>
          d.expected.includes("succeeded") && d.actual.includes("failed"),
      ),
    ).toBe(true);
    expect(
      invoiceOnes.some(
        (d) =>
          d.expected.includes("8.00") && d.actual.includes("7.50"),
      ),
    ).toBe(true);

    // Matching invoice+payment must not be flagged.
    expect(
      invoiceOnes.some((d) => d.expected.includes(INV_OK) || d.actual.includes(INV_OK)),
    ).toBe(false);

    const events = await outboxStore.list();
    const detected = events.filter((e) => e.event.type === "DiscrepancyDetected");
    expect(detected.length).toBe(3);
    expect(detected.every((e) => e.event.producer === "AC-08")).toBe(true);
    expect(detected.every((e) => e.event.data.scope === "invoice")).toBe(true);
  });

  it("flags market short of ClearingResult (REQ-041, UAT-052, S5)", async () => {
    seedUat052Fixture();
    await service.reconcile({ scope: "market", communityId: COMMUNITY });

    const discrepancies = service.listDiscrepancies(COMMUNITY);
    const marketOnes = discrepancies.filter((d) => d.scope === "market");
    expect(marketOnes.length).toBeGreaterThanOrEqual(1);
    expect(
      marketOnes.some(
        (d) =>
          d.expected.includes("numTrades=2") &&
          d.actual.includes("numTrades=1"),
      ),
    ).toBe(true);

    const events = await outboxStore.list();
    expect(
      events.some(
        (e) =>
          e.event.type === "DiscrepancyDetected" &&
          e.event.data.scope === "market",
      ),
    ).toBe(true);
  });

  it("is idempotent on re-run (same discrepancies, no duplicate events)", async () => {
    seedUat052Fixture();
    await service.reconcile({ scope: "invoice" });
    await service.reconcile({ scope: "invoice" });

    expect(service.listDiscrepancies().filter((d) => d.scope === "invoice")).toHaveLength(
      3,
    );
    const events = await outboxStore.list();
    expect(
      events.filter((e) => e.event.type === "DiscrepancyDetected"),
    ).toHaveLength(3);
  });

  it("projects IntakeAnomalyDetected into a market discrepancy on reconcile", async () => {
    service.projectIntakeAnomaly({
      type: "trade_count_mismatch",
      marketId: "mkt-anomaly",
      communityId: COMMUNITY,
      details: "expected=2 actual=1",
    });
    await service.reconcile({ scope: "market" });
    const rows = service.listDiscrepancies(COMMUNITY);
    expect(rows.some((d) => d.scope === "market" && d.actual.includes("mkt-anomaly"))).toBe(
      true,
    );
  });

  it("rejects an invalid scope", async () => {
    await expect(
      service.reconcile({ scope: "unknown" as "invoice" }),
    ).rejects.toThrow(/scope must be invoice or market/);
  });

  it("flags quantity-only market mismatch (REQ-041)", async () => {
    service.projectMarket({
      marketId: "mkt-qty",
      communityId: COMMUNITY,
      expectedNumTrades: 1,
      expectedTradedQuantityKWh: "8.00",
      actualNumTrades: 1,
      actualTradedQuantityKWh: "4.00",
    });
    await service.reconcile({ scope: "market" });
    expect(
      service
        .listDiscrepancies()
        .some(
          (d) =>
            d.scope === "market" &&
            d.expected.includes("8.00") &&
            d.actual.includes("4.00"),
        ),
    ).toBe(true);
  });
});
