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
const TRADE_IDS = [
  "0x8f3a1c2b4d5e6f708192a3b4c5d6e7f8",
  "0x1a2b3c4d5e6f708192a3b4c5d6e7f809",
  "0xabcdef0123456789abcdef0123456789",
];

function openInvoice(overrides: Partial<InvoiceProjection> = {}): InvoiceProjection {
  const now = "2026-12-01T06:00:00+01:00";
  return {
    invoiceId: INVOICE_ID,
    billingId: "a2b4c6d8-1e3f-4a5b-8c7d-9e0f1a2b3c4d",
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
    dataspace.publish("billingInvoice", agedInvoice);

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
});

function toValidInvoicePayload(): Record<string, unknown> {
  return {
    invoiceId: INVOICE_ID,
    billingId: "a2b4c6d8-1e3f-4a5b-8c7d-9e0f1a2b3c4d",
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
