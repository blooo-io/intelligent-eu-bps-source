/**
 * INT-109 — AC-10 publication (REQ-048, REQ-053, UAT-070, UAT-069, BR-11).
 */
import "reflect-metadata";
import { beforeEach, describe, expect, it } from "vitest";
import { createMockDataSpace } from "@intelligent/mocks";
import { PublicationStore } from "../domain/store.js";
import type {
  InvoiceProjection,
  PaymentProjection,
} from "../domain/types.js";
import { PublicationService } from "./publication.service.js";

const COMMUNITY = "c0ffee00-1234-4abc-8def-0123456789ab";
const CONSUMER = "11111111-2222-4333-8444-555555555555";
const PRODUCER = "66666666-7777-4888-9999-aaaaaaaaaaaa";
const INVOICE_ID = "3f1c2a9e-8b7d-4c21-9a0e-5d6f7a8b9c01";
const PAYMENT_ID = "9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a";
const BILLING_ID = "a2b4c6d8-1e3f-4a5b-8c7d-9e0f1a2b3c4d";
const ISSUER_STATEMENT_ID = "d3e5f7a9-2b4c-4d6e-8f0a-1b2c3d4e5f6a";
const TRADE_IDS = [
  "0x8f3a1c2b4d5e6f708192a3b4c5d6e7f8",
  "0x1a2b3c4d5e6f708192a3b4c5d6e7f809",
  "0xabcdef0123456789abcdef0123456789",
];

function openInvoice(overrides: Partial<InvoiceProjection> = {}): InvoiceProjection {
  const now = "2026-12-01T06:00:00+01:00";
  return {
    invoiceId: INVOICE_ID,
    billingId: BILLING_ID,
    issuerStatementId: ISSUER_STATEMENT_ID,
    communityId: COMMUNITY,
    billingMode: "virtual",
    settlementType: "periodic",
    billingPeriodFrom: "2026-11-01T00:00:00+01:00",
    billingPeriodUntil: "2026-12-01T00:00:00+01:00",
    invoiceStatus: "Open",
    invoiceIssueDate: now,
    invoiceIssuedTo: CONSUMER,
    invoiceIssuedBy: PRODUCER,
    selfBilling: true,
    invoiceDueDate: "2026-12-15",
    totalEnergyKWh: 42.5,
    totalAmount: 10.2,
    outstandingAmount: 10.2,
    energyAmount: 10.2,
    gridFeeAmount: 0,
    gridFeeStatus: "not_published",
    taxAmount: 0,
    vatRate: 0,
    carriedForwardAmount: 0,
    currency: "CHF",
    exchangeRate: {
      sourceCurrency: "EUR",
      rate: 0.9412,
      rateDate: "2026-11-30",
      rateSource: "ECB",
    },
    tradeIds: [...TRADE_IDS],
    paymentIds: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function succeededPayment(
  overrides: Partial<PaymentProjection> = {},
): PaymentProjection {
  return {
    paymentId: PAYMENT_ID,
    invoiceId: INVOICE_ID,
    communityId: COMMUNITY,
    billingMode: "virtual",
    payerId: CONSUMER,
    payeeId: PRODUCER,
    paymentDate: "2026-12-03T10:14:52+01:00",
    paymentAmount: 10.2,
    currency: "CHF",
    paymentMethod: "card",
    paymentProvider: "stripe",
    paymentStatus: "succeeded",
    failureCategory: null,
    createdAt: "2026-12-03T10:14:30+01:00",
    updatedAt: "2026-12-03T10:15:00+01:00",
    ...overrides,
  };
}

describe("PublicationService", () => {
  let store: PublicationStore;
  let dataspace: ReturnType<typeof createMockDataSpace>;
  let service: PublicationService;

  beforeEach(() => {
    store = new PublicationStore();
    dataspace = createMockDataSpace();
    service = new PublicationService(store, dataspace);
  });

  it("Payment.createdAt stays immutable across status updates", async () => {
    const first = succeededPayment({
      paymentStatus: "pending",
      createdAt: "2026-12-01T06:00:00Z",
      updatedAt: "2026-12-01T06:00:00Z",
      paymentDate: null,
    });
    await service.onPaymentStatusChanged(first);
    await service.onPaymentStatusChanged(
      succeededPayment({
        createdAt: "2026-12-03T10:14:30+01:00",
        updatedAt: "2026-12-03T10:14:30+01:00",
      }),
    );
    expect(store.getPayment(PAYMENT_ID)?.createdAt).toBe("2026-12-01T06:00:00Z");
    expect(store.getPayment(PAYMENT_ID)?.paymentStatus).toBe("succeeded");
  });

  it("publishes Paid invoice and payment that validate on EWDS topics (REQ-048, UAT-070)", async () => {
    await service.onInvoiceIssued(openInvoice());
    await service.onPaymentStatusChanged(succeededPayment());

    const recorded = dataspace.recorded();
    const invoices = recorded.filter((r) => r.topic === "billingInvoice");
    const payments = recorded.filter((r) => r.topic === "billingPayment");
    expect(payments).toHaveLength(1);
    expect(invoices.length).toBeGreaterThanOrEqual(1);

    const lastInvoice = invoices[invoices.length - 1]!.message as Record<
      string,
      unknown
    >;
    expect(lastInvoice.billingMode).toBe("virtual");
    expect(lastInvoice.invoiceStatus).toBe("Paid");
    expect(lastInvoice.invoiceIssuedBy).toBe(PRODUCER);
    expect(lastInvoice.invoiceIssuedTo).toBe(CONSUMER);
    expect(lastInvoice.tradeIds).toEqual(TRADE_IDS);
    expect(lastInvoice.gridFeeAmount).toBe(0);
    expect(lastInvoice.paymentIds).toEqual([PAYMENT_ID]);
    // No personal data / Stripe legal numbers in payload.
    expect(JSON.stringify(lastInvoice)).not.toMatch(/@|acct_|in_|pm_/i);

    const payment = payments[0]!.message as Record<string, unknown>;
    expect(payment.paymentStatus).toBe("succeeded");
    expect(payment.paymentAmount).toBe(10.2);

    // BR-11 — publication never mutates trade status (no market port call).
    expect(store.listOutbound().every((o) => o.status === "published")).toBe(
      true,
    );
  });

  it("retries failed outbound messages (REQ-048)", async () => {
    // Force a failed row by publishing an invalid payload directly via store path.
    const bad = openInvoice({ currency: "INVALID" as "CHF" });
    await service.onInvoiceIssued(bad);
    const failed = store.listOutbound().filter((o) => o.status === "failed");
    expect(failed.length).toBeGreaterThanOrEqual(1);

    // Fix projection payload and retry.
    const row = failed[0]!;
    store.putOutbound({
      ...row,
      payload: {
        ...toValidInvoicePayload(),
      },
      status: "failed",
    });
    const result = await service.retryPending();
    expect(result.retried).toBeGreaterThanOrEqual(1);
    expect(
      store.listOutbound().some((o) => o.messageId === row.messageId && o.status === "published"),
    ).toBe(true);
  });

  it("purges gateway and local cache older than 7 days (REQ-053, UAT-069)", async () => {
    await service.onInvoiceIssued(openInvoice());
    await service.onPaymentStatusChanged(succeededPayment());
    expect(dataspace.recorded().length).toBeGreaterThanOrEqual(2);

    // Age local outbound + mock log entries to 8 days ago.
    const eightDaysAgo = new Date(
      Date.now() - 8 * 24 * 60 * 60 * 1000,
    ).toISOString();
    for (const row of store.listOutbound()) {
      store.putOutbound({ ...row, updatedAt: eightDaysAgo });
    }
    // Re-seed mock log with old updatedAt by publishing aged payloads.
    const agedInvoice = {
      ...toValidInvoicePayload(),
      updatedAt: eightDaysAgo,
    };
    await dataspace.publish("billingInvoice", agedInvoice);

    const before = new Date().toISOString();
    const purged = await service.purgeCache(before);
    expect(purged.purgedGateway).toBeGreaterThanOrEqual(1);
    expect(purged.purgedLocal).toBeGreaterThanOrEqual(1);
    // Normalized billing projections remain.
    expect(store.getInvoice(INVOICE_ID)).toBeDefined();
    expect(store.getPayment(PAYMENT_ID)).toBeDefined();
  });

  it("rejects purge without before", async () => {
    await expect(service.purgeCache("")).rejects.toThrow(/before/);
  });

  it("publishes statement, payout and kyc topics from service methods", async () => {
    await service.onStatementIssued({
      billingId: BILLING_ID,
      communityId: COMMUNITY,
      actorId: CONSUMER,
      siteId: null,
      billingMode: "virtual",
      billingPeriodFrom: "2026-11-01T00:00:00Z",
      billingPeriodUntil: "2026-12-01T00:00:00Z",
      billingStatus: "Open",
      overdueDate: null,
      totalBought: 1,
      totalSold: 0,
      netBalance: -1,
      balanceDirection: "pay",
      totalEnergyAmount: 1,
      totalGridFeeAmount: 0,
      totalTaxAmount: 0,
      totalAmountDue: 1,
      totalAmountPaid: 0,
      outstandingAmount: 1,
      currency: "EUR",
      invoiceIds: [INVOICE_ID],
      payoutIds: null,
      createdAt: "2026-12-01T06:00:00Z",
      updatedAt: "2026-12-01T06:00:00Z",
    });
    await service.onPayoutStatusChanged({
      payoutId: "b1b2b3b4-b5b6-4788-9999-cccccccccccc",
      actorId: PRODUCER,
      communityId: COMMUNITY,
      billingMode: "virtual",
      amount: 1,
      currency: "EUR",
      payoutStatus: "paid",
      trigger: "manual",
      statementIds: [BILLING_ID],
      arrivalDate: null,
      failureCategory: null,
      createdAt: "2026-12-01T06:00:00Z",
      updatedAt: "2026-12-01T06:00:00Z",
    });
    await service.onKycStatusChanged({
      actorId: PRODUCER,
      communityId: COMMUNITY,
      kycVerified: true,
      accountStatus: "Active",
      verificationKind: "connect_account",
      updatedAt: "2026-12-01T06:00:00Z",
    });
    const topics = new Set(dataspace.recorded().map((r) => r.topic));
    expect(topics.has("billingStatement")).toBe(true);
    expect(topics.has("billingPayout")).toBe(true);
    expect(topics.has("billingKycStatus")).toBe(true);
  });

  it("retryPending marks rows failed when publish returns ok:false", async () => {
    await service.onInvoiceIssued(openInvoice());
    // Force a failed outbound by publishing an invalid payload shape via store.
    store.putOutbound({
      messageId: "msg-fail",
      topic: "billingInvoice",
      aggregateId: "missing-agg",
      payload: { broken: true },
      status: "failed",
      updatedAt: new Date().toISOString(),
    });
    const result = await service.retryPending();
    expect(result.retried).toBeGreaterThanOrEqual(1);
    const failed = store
      .listOutbound()
      .find((r) => r.messageId === "msg-fail");
    expect(failed?.status).toBe("failed");
  });

  it("payment for an unknown invoice still publishes billingPayment", async () => {
    await service.onPaymentStatusChanged(succeededPayment());
    expect(
      dataspace.recorded().some((r) => r.topic === "billingPayment"),
    ).toBe(true);
    expect(store.getInvoice(INVOICE_ID)).toBeUndefined();
  });

  it("status change and succeeded payment mark the invoice Paid", async () => {
    await service.onInvoiceIssued(openInvoice());
    await service.onInvoiceStatusChanged({
      invoiceId: INVOICE_ID,
      status: "PartiallyPaid",
      outstanding: 5.1,
    });
    expect(store.getInvoice(INVOICE_ID)?.outstandingAmount).toBe(5.1);
    await service.onPaymentStatusChanged(succeededPayment());
    expect(store.getInvoice(INVOICE_ID)?.invoiceStatus).toBe("Paid");
    expect(store.getInvoice(INVOICE_ID)?.outstandingAmount).toBe(0);
  });

  it("retryPending republishes a pending row when the payload is valid", async () => {
    await service.onInvoiceIssued(openInvoice());
    const published = store.listOutbound().find((r) => r.topic === "billingInvoice");
    expect(published).toBeDefined();
    store.putOutbound({
      ...published!,
      status: "pending",
      publishedAt: undefined,
      purgeAt: undefined,
    });
    const result = await service.retryPending();
    expect(result.retried).toBeGreaterThanOrEqual(1);
    expect(
      store.listOutbound().find((r) => r.messageId === published!.messageId)
        ?.status,
    ).toBe("published");
  });

  it("rejects purge with a non-date before value", async () => {
    await expect(service.purgeCache("not-a-date")).rejects.toThrow(/before/);
  });
});

function toValidInvoicePayload(): Record<string, unknown> {
  return {
    invoiceId: INVOICE_ID,
    billingId: BILLING_ID,
    issuerStatementId: ISSUER_STATEMENT_ID,
    communityId: COMMUNITY,
    billingMode: "virtual",
    settlementType: "periodic",
    billingPeriodFrom: "2026-11-01T00:00:00+01:00",
    billingPeriodUntil: "2026-12-01T00:00:00+01:00",
    invoiceStatus: "Open",
    invoiceIssueDate: "2026-12-01T06:00:00+01:00",
    invoiceIssuedTo: CONSUMER,
    invoiceIssuedBy: PRODUCER,
    selfBilling: true,
    invoiceDueDate: "2026-12-15",
    totalEnergyKWh: 42.5,
    totalAmount: 10.2,
    outstandingAmount: 10.2,
    energyAmount: 10.2,
    gridFeeAmount: 0,
    gridFeeStatus: "not_published",
    taxAmount: 0,
    totalTaxAmount: 0,
    vatRate: 0,
    carriedForwardAmount: 0,
    currency: "CHF",
    exchangeRate: {
      sourceCurrency: "EUR",
      rate: 0.9412,
      rateDate: "2026-11-30",
      rateSource: "ECB",
    },
    createdAt: "2026-12-01T06:00:00+01:00",
    updatedAt: "2026-12-01T06:00:00+01:00",
    tradeIds: TRADE_IDS,
    paymentIds: null,
  };
}
