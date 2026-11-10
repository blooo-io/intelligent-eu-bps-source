/**
 * INT-112 / INT-82 — AC-09 reporting (REQ-018/031/032/046/047, UAT-018/031/032/057/058).
 */
import "reflect-metadata";
import { beforeEach, describe, expect, it } from "vitest";
import { ReportingStore } from "../domain/store.js";
import { ReportingService } from "./reporting.service.js";

const COMMUNITY = "c0ffee00-1234-4abc-8def-0123456789ab";
const PERIOD = "2026-09";
const CONSUMER = "11111111-2222-4333-8444-555555555555";
const PRODUCER = "22222222-2222-4333-8444-555555555555";
const INV1 = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const INV2 = "bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const PAY_OK = "cccccccc-cccc-4ccc-8ddd-eeeeeeeeeeee";
const PAY_FAIL = "dddddddd-dddd-4ddd-8ddd-eeeeeeeeeeee";

describe("ReportingService", () => {
  let service: ReportingService;

  beforeEach(() => {
    service = new ReportingService(new ReportingStore());
    service.projectInvoice({
      invoiceId: INV1,
      communityId: COMMUNITY,
      producerId: PRODUCER,
      consumerId: CONSUMER,
      period: PERIOD,
      currency: "EUR",
      status: "Open",
      total: "10.00",
      tradeIds: ["t1"],
      energyKwh: "4.50",
    });
    service.projectInvoice({
      invoiceId: INV2,
      communityId: COMMUNITY,
      producerId: PRODUCER,
      consumerId: CONSUMER,
      period: PERIOD,
      currency: "EUR",
      status: "Open",
      total: "5.50",
      tradeIds: ["t2"],
      energyKwh: "2.00",
    });
    service.projectPayment({
      paymentId: PAY_OK,
      invoiceId: INV1,
      communityId: COMMUNITY,
      amount: "10.00",
      currency: "EUR",
      status: "succeeded",
      method: "card",
      processingTimeMs: 420,
      participantId: CONSUMER,
    });
    service.projectPayment({
      paymentId: PAY_FAIL,
      invoiceId: INV2,
      communityId: COMMUNITY,
      amount: "5.50",
      currency: "EUR",
      status: "failed",
      method: "card",
      failureCategory: "card_declined",
      processingTimeMs: 180,
      participantId: CONSUMER,
    });
  });

  it("UAT-018 — payments overview matches underlying records", () => {
    const overview = service.getPaymentsOverview(COMMUNITY);
    expect(overview).toHaveLength(2);
    expect(overview.map((p) => p.status).sort()).toEqual([
      "failed",
      "succeeded",
    ]);
    expect(overview.find((p) => p.paymentId === PAY_FAIL)?.failureCategory).toBe(
      "card_declined",
    );
  });

  it("UAT-031 — member history returns invoices and payments together", () => {
    const history = service.getParticipantHistory(CONSUMER);
    expect(history.participantId).toBe(CONSUMER);
    expect(history.invoices).toHaveLength(2);
    expect(history.payments).toHaveLength(2);
    expect(history.invoices.every((i) => i.invoiceId)).toBe(true);
    expect(history.payments.every((p) => p.paymentId && p.invoiceId)).toBe(true);
  });

  it("UAT-032 — periodic summary totals match invoice sum", async () => {
    await service.buildReport({ communityId: COMMUNITY, period: PERIOD });
    const summary = service.getPeriodicSummary(COMMUNITY, PERIOD);
    expect(summary).toEqual({
      communityId: COMMUNITY,
      period: PERIOD,
      currency: "EUR",
      invoiceCount: 2,
      paymentCount: 2,
      total: "15.50",
    });
  });

  it("UAT-058 — KPI CSV matches invoices amounts and kWh", async () => {
    await service.exportKpi({ communityId: COMMUNITY, period: PERIOD });
    const file = service.getKpiExport(PERIOD, COMMUNITY);
    const text = file.body.toString("utf8");
    expect(text).toContain("recordType,communityId,period,participantId,invoiceId");
    expect(text).toContain(`invoice,${COMMUNITY},${PERIOD},${CONSUMER},${INV1},,10.00,4.50,EUR`);
    expect(text).toContain(`invoice,${COMMUNITY},${PERIOD},${CONSUMER},${INV2},,5.50,2.00,EUR`);
    expect(text).toContain(CONSUMER);
  });

  it("UAT-057 — KPI CSV logs failure cause, corrective action and processing time (REQ-046)", async () => {
    await service.exportKpi({ communityId: COMMUNITY, period: PERIOD });
    const text = service.getKpiExport(PERIOD, COMMUNITY).body.toString("utf8");
    expect(text).toContain("failureCategory,correctiveAction");
    expect(text).toContain(
      `payment,${COMMUNITY},${PERIOD},${CONSUMER},${INV2},${PAY_FAIL},5.50,,EUR,failed,card,180,card_declined,`,
    );
    expect(text).toMatch(
      /Ask the consumer to use another card or contact their bank/,
    );
    expect(text).toContain(
      `payment,${COMMUNITY},${PERIOD},${CONSUMER},${INV1},${PAY_OK},10.00,,EUR,succeeded,card,420,,`,
    );
  });

  it("computes live summary without prior BuildReport and empty history", () => {
    const summary = service.getPeriodicSummary(COMMUNITY, PERIOD);
    expect(summary.total).toBe("15.50");
    expect(service.getParticipantHistory("99999999-9999-4999-8999-999999999999")).toEqual({
      participantId: "99999999-9999-4999-8999-999999999999",
      invoices: [],
      payments: [],
    });
    expect(
      service.getParticipantHistory("99999999-9999-4999-8999-999999999999", {
        communityId: COMMUNITY,
      }),
    ).toEqual({
      participantId: "99999999-9999-4999-8999-999999999999",
      invoices: [],
      payments: [],
    });
  });

  it("UAT-060 — history stays inside the caller community (REQ-049)", () => {
    expect(() =>
      service.getParticipantHistory(CONSUMER, {
        communityId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      }),
    ).toThrow(/Unknown participant/);
    expect(() =>
      service.getParticipantHistory(PRODUCER, {
        communityId: COMMUNITY,
        selfParticipantId: CONSUMER,
      }),
    ).toThrow(/Unknown participant/);
    expect(() =>
      service.getParticipantHistory(CONSUMER, { communityId: "" }),
    ).toThrow(/Missing community scope/);
    const own = service.getParticipantHistory(CONSUMER, {
      communityId: COMMUNITY,
      selfParticipantId: CONSUMER,
    });
    expect(own.invoices.length).toBeGreaterThan(0);
  });

  it("rejects missing scope and unknown KPI period", async () => {
    expect(() => service.getPaymentsOverview("")).toThrow(/communityId/);
    expect(() => service.getParticipantHistory("")).toThrow(/participantId/);
    expect(() => service.getPeriodicSummary("", PERIOD)).toThrow(/communityId/);
    await expect(service.buildReport({ communityId: "", period: PERIOD })).rejects.toThrow(
      /communityId/,
    );
    await expect(service.exportKpi({ communityId: COMMUNITY, period: "" })).rejects.toThrow(
      /period/,
    );
    expect(() => service.getKpiExport("2099-01", COMMUNITY)).toThrow(/No KPI data/);
    expect(() => service.getKpiExport("", COMMUNITY)).toThrow(/period/);
  });
});
