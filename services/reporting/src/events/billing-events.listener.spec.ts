import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReportingStore } from "../domain/store.js";
import { ReportingService } from "../reporting/reporting.service.js";
import { InMemoryEventBus } from "./in-memory-event-bus.js";
import { BillingEventsListener } from "./billing-events.listener.js";

describe("BillingEventsListener reporting (INT-271)", () => {
  let bus: InMemoryEventBus;
  let projectInvoice: ReturnType<typeof vi.fn>;
  let projectPayment: ReturnType<typeof vi.fn>;
  let projectStatement: ReturnType<typeof vi.fn>;
  let projectPayout: ReturnType<typeof vi.fn>;
  let getStatement: ReturnType<typeof vi.fn>;
  let buildReport: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    bus = new InMemoryEventBus();
    projectInvoice = vi.fn();
    projectPayment = vi.fn();
    projectStatement = vi.fn();
    projectPayout = vi.fn();
    getStatement = vi.fn().mockReturnValue(undefined);
    buildReport = vi.fn().mockResolvedValue({ accepted: true });
    const listener = new BillingEventsListener(bus, {
      projectInvoice,
      projectPayment,
      projectStatement,
      projectPayout,
      getStatement,
      buildReport,
    } as never);
    await listener.onModuleInit();
  });

  it("projects InvoiceIssued", async () => {
    await bus.publish("InvoiceIssued", {
      communityId: "c1",
      data: {
        invoiceId: "inv-1",
        issuerId: "p1",
        recipientId: "c-user",
        currency: "EUR",
        amounts: { total: "2.00" },
        tradeIds: ["t1"],
      },
    });
    expect(projectInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        invoiceId: "inv-1",
        communityId: "c1",
        total: "2.00",
      }),
    );
  });

  it("projects PaymentStatusChanged", async () => {
    await bus.publish("PaymentStatusChanged", {
      communityId: "c1",
      data: {
        paymentId: "pay-1",
        invoiceId: "inv-1",
        status: "succeeded",
        amount: "2.00",
        currency: "EUR",
      },
    });
    expect(projectPayment).toHaveBeenCalledWith(
      expect.objectContaining({ paymentId: "pay-1", status: "succeeded" }),
    );
  });

  it("builds report on BillingRunCompleted", async () => {
    await bus.publish("BillingRunCompleted", {
      communityId: "c1",
      data: { period: "2026-10" },
    });
    expect(buildReport).toHaveBeenCalledWith({
      communityId: "c1",
      period: "2026-10",
    });
  });

  it("projects StatementIssued", async () => {
    await bus.publish("StatementIssued", {
      communityId: "c1",
      data: {
        statementId: "st-1",
        participantId: "P1",
        period: "2026-10",
        totalSold: "10.00",
        totalBought: "0.00",
        netBalance: "10.00",
        currency: "EUR",
        status: "Open",
      },
    });
    expect(projectStatement).toHaveBeenCalledWith(
      expect.objectContaining({
        statementId: "st-1",
        participantId: "P1",
        communityId: "c1",
        totalSold: "10.00",
        netAmount: "10.00",
        netBalance: "10.00",
      }),
    );
  });

  it("projects ParticipantStatementIssued with KPI fields (Task 5.12)", async () => {
    await bus.publish("ParticipantStatementIssued", {
      communityId: "c1",
      data: {
        statementId: "st-kpi",
        participantId: "P1",
        communityId: "c1",
        period: "2026-11",
        currency: "EUR",
        status: "Issued",
        energyBoughtKwh: "120.000",
        energySoldKwh: "45.500",
        totalBought: "24.00",
        totalSold: "9.10",
        netAmount: "-14.90",
        components: {
          energy: "13.50",
          gridFee: "1.10",
          levies: "0.30",
          vat: "0.00",
        },
        invoiceIds: ["inv-a", "inv-b"],
      },
    });
    expect(projectStatement).toHaveBeenCalledWith({
      statementId: "st-kpi",
      participantId: "P1",
      communityId: "c1",
      period: "2026-11",
      totalSold: "9.10",
      totalBought: "24.00",
      netBalance: "-14.90",
      netAmount: "-14.90",
      currency: "EUR",
      status: "Issued",
      energyBoughtKwh: "120.000",
      energySoldKwh: "45.500",
      components: {
        energy: "13.50",
        gridFee: "1.10",
        levies: "0.30",
        vat: "0.00",
      },
      invoiceIds: ["inv-a", "inv-b"],
    });
  });

  it("drops statement events when money fields are not strings", async () => {
    await bus.publish("ParticipantStatementIssued", {
      communityId: "c1",
      data: {
        statementId: "st-bad",
        participantId: "P1",
        period: "2026-11",
        totalBought: 24,
        totalSold: "9.10",
        netAmount: "-14.90",
      },
    });
    expect(projectStatement).not.toHaveBeenCalled();
  });

  it("drops statement events when component money fields are not strings", async () => {
    await bus.publish("ParticipantStatementIssued", {
      communityId: "c1",
      data: {
        statementId: "st-bad-comp",
        participantId: "P1",
        period: "2026-11",
        totalBought: "24.00",
        totalSold: "9.10",
        netAmount: "-14.90",
        components: { energy: 13.5, gridFee: "1.10", levies: "0.30", vat: "0.00" },
      },
    });
    expect(projectStatement).not.toHaveBeenCalled();
  });

  it("projects PayoutStatusChanged", async () => {
    await bus.publish("PayoutStatusChanged", {
      communityId: "c1",
      data: {
        payoutId: "po-1",
        participantId: "P1",
        period: "2026-10",
        amount: "9.60",
        currency: "EUR",
        status: "paid",
      },
    });
    expect(projectPayout).toHaveBeenCalledWith(
      expect.objectContaining({
        payoutId: "po-1",
        participantId: "P1",
        status: "paid",
        amount: "9.60",
      }),
    );
  });

  it("merges StatementStatusChanged onto an existing statement", async () => {
    getStatement.mockReturnValue({
      statementId: "st-1",
      participantId: "P1",
      communityId: "c1",
      period: "2026-10",
      totalSold: "10.00",
      totalBought: "0.00",
      netBalance: "10.00",
      netAmount: "10.00",
      currency: "EUR",
      status: "Open",
      energyBoughtKwh: "0.000",
      energySoldKwh: "0.000",
      components: { energy: "0.00", gridFee: "0.00", levies: "0.00", vat: "0.00" },
      invoiceIds: [],
    });
    await bus.publish("StatementStatusChanged", {
      communityId: "c1",
      data: {
        statementId: "st-1",
        participantId: "P1",
        period: "2026-10",
        status: "Paid",
      },
    });
    expect(projectStatement).toHaveBeenCalledWith(
      expect.objectContaining({
        statementId: "st-1",
        totalSold: "10.00",
        status: "Paid",
      }),
    );
  });

  it("projects StatementStatusChanged without a prior row", async () => {
    await bus.publish("StatementStatusChanged", {
      communityId: "c1",
      data: {
        statementId: "st-new",
        participantId: "P9",
        period: "2026-10",
        status: "Open",
      },
    });
    expect(projectStatement).toHaveBeenCalledWith(
      expect.objectContaining({
        statementId: "st-new",
        participantId: "P9",
        status: "Open",
        netAmount: "0.00",
        energyBoughtKwh: "0.000",
        invoiceIds: [],
      }),
    );
  });

  it("ignores statement and payout envelopes without ids", async () => {
    await bus.publish("StatementIssued", { communityId: "c1", data: {} });
    await bus.publish("ParticipantStatementIssued", { communityId: "c1", data: {} });
    await bus.publish("StatementStatusChanged", { communityId: "c1", data: {} });
    await bus.publish("PayoutStatusChanged", { communityId: "c1", data: {} });
    expect(projectStatement).not.toHaveBeenCalled();
    expect(projectPayout).not.toHaveBeenCalled();
  });
});

describe("UAT-057 payment KPI projection (REQ-046)", () => {
  const PAYMENT = "pay-kpi-1";
  const INVOICE = "inv-kpi-1";
  const PAYER = "payer-1";
  const PAYEE = "payee-1";
  const T0 = "2026-11-24T10:00:00.000Z";
  const T1 = "2026-11-24T10:00:02.500Z";

  let bus: InMemoryEventBus;
  let store: ReportingStore;
  let listener: BillingEventsListener;

  beforeEach(async () => {
    bus = new InMemoryEventBus();
    store = new ReportingStore();
    const reporting = new ReportingService(store);
    listener = new BillingEventsListener(bus, reporting);
    await listener.onModuleInit();
  });

  it("UAT-057 projects amount, timing and fee from PaymentStatusChanged", async () => {
    await bus.publish("PaymentStatusChanged", {
      communityId: "c1",
      data: {
        paymentId: PAYMENT,
        invoiceId: INVOICE,
        payerId: PAYER,
        payeeId: PAYEE,
        status: "succeeded",
        amount: "12.34",
        currency: "EUR",
        method: "card",
        initiatedAt: T0,
        settledAt: T1,
        processingTimeMs: 2500,
        feeAmount: "0.44",
        feeCurrency: "EUR",
      },
    });
    expect(store.getPayment(PAYMENT)).toMatchObject({
      amount: "12.34",
      participantId: PAYER,
      payerId: PAYER,
      payeeId: PAYEE,
      processingTimeMs: 2500,
      feeAmount: "0.44",
      feeCurrency: "EUR",
      settledAt: T1,
      initiatedAt: T0,
    });
  });

  it("UAT-057 a later pending event does not erase settledAt/fee", async () => {
    await bus.publish("PaymentStatusChanged", {
      communityId: "c1",
      data: {
        paymentId: PAYMENT,
        invoiceId: INVOICE,
        payerId: PAYER,
        payeeId: PAYEE,
        status: "succeeded",
        amount: "12.34",
        currency: "EUR",
        method: "card",
        initiatedAt: T0,
        settledAt: T1,
        processingTimeMs: 2500,
        feeAmount: "0.44",
        feeCurrency: "EUR",
      },
    });
    await bus.publish("PaymentStatusChanged", {
      communityId: "c1",
      data: {
        paymentId: PAYMENT,
        invoiceId: INVOICE,
        payerId: PAYER,
        payeeId: PAYEE,
        status: "pending",
        amount: "12.34",
        currency: "EUR",
        method: "card",
        initiatedAt: T0,
      },
    });
    expect(store.getPayment(PAYMENT)).toMatchObject({
      status: "pending",
      settledAt: T1,
      feeAmount: "0.44",
      feeCurrency: "EUR",
      processingTimeMs: 2500,
      participantId: PAYER,
    });
  });
});
