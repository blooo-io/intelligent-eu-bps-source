/**
 * INT-376 / NFR-004 / REQ-048 — a contract-shaped event must publish a
 * payload the EWDS topic schema accepts. The listener used to fill the
 * gaps with values the schema rejects.
 */
import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { createMockDataSpace } from "@intelligent/mocks";
import { PublicationStore } from "../domain/store.js";
import { PublicationService } from "../publication/publication.service.js";
import { BillingEventsListener } from "./billing-events.listener.js";
import { InMemoryEventBus } from "./in-memory-event-bus.js";

const COMMUNITY = "c0ffee00-1234-4abc-8def-0123456789ab";
const CONSUMER = "11111111-2222-4333-8444-555555555555";
const PRODUCER = "66666666-7777-4888-9999-aaaaaaaaaaaa";
const INVOICE_ID = "3f1c2a9e-8b7d-4c21-9a0e-5d6f7a8b9c01";
const SETTLEMENT_ID = "a2b4c6d8-1e3f-4a5b-8c7d-9e0f1a2b3c4d";
const PAYMENT_ID = "9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a";
const FAILED_PAYMENT_ID = "8d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a";

function envelope(type: string, producer: string, data: Record<string, unknown>) {
  return {
    eventId: crypto.randomUUID(),
    type,
    version: 1,
    occurredAt: "2026-12-01T06:00:00.000Z",
    producer,
    communityId: COMMUNITY,
    billingMode: "virtual" as const,
    data,
  };
}

describe("EWDS topic payload from contract events (INT-376, NFR-004, UAT-070)", () => {
  it("publishes a schema-valid invoice and payment, including a CHF rate", async () => {
    const dataspace = createMockDataSpace();
    const store = new PublicationStore();
    const service = new PublicationService(store, dataspace);
    const bus = new InMemoryEventBus();
    const listener = new BillingEventsListener(bus, service);
    await listener.onModuleInit();

    await bus.publish(
      "InvoiceIssued",
      envelope("InvoiceIssued", "AC-06", {
        invoiceId: INVOICE_ID,
        issuerId: PRODUCER,
        recipientId: CONSUMER,
        settlementId: SETTLEMENT_ID,
        dueDate: "2026-12-15",
        billingPeriodFrom: "2026-11-01T00:00:00.000Z",
        billingPeriodUntil: "2026-12-01T00:00:00.000Z",
        settlementType: "periodic",
        totalEnergyKWh: "5.000",
        vatRate: 0.081,
        carriedForwardAmount: "-1.20",
        exchangeRate: { rate: "0.941200", rateDate: "2026-11-30" },
        amounts: { energy: "10.00", vat: "0.81", total: "10.81" },
        currency: "CHF",
        tradeIds: ["0x8f3a1c2b4d5e6f708192a3b4c5d6e7f8"],
      }),
    );
    await bus.publish(
      "PaymentStatusChanged",
      envelope("PaymentStatusChanged", "AC-07", {
        paymentId: PAYMENT_ID,
        invoiceId: INVOICE_ID,
        payerId: CONSUMER,
        payeeId: PRODUCER,
        status: "succeeded",
        amount: "10.81",
        currency: "CHF",
        method: "card",
      }),
    );

    const outbound = store.listOutbound();
    expect(outbound.every((row) => row.status === "published")).toBe(true);

    const invoice = dataspace
      .recorded()
      .filter((row) => row.topic === "billingInvoice")
      .at(-1)!.message as Record<string, unknown>;
    expect(invoice.billingId).toBe(SETTLEMENT_ID);
    expect(invoice.invoiceIssueDate).toBe("2026-12-01T06:00:00.000Z");
    expect(invoice.billingPeriodFrom).toBe("2026-11-01T00:00:00.000Z");
    expect(invoice.carriedForwardAmount).toBe(1.2);
    expect(invoice.exchangeRate).toEqual({
      sourceCurrency: "EUR",
      rate: 0.9412,
      rateDate: "2026-11-30",
      rateSource: "ECB",
    });
    expect(invoice.gridFeeAmount).toBe(0);

    const payment = dataspace
      .recorded()
      .find((row) => row.topic === "billingPayment")!.message as Record<
      string,
      unknown
    >;
    expect(payment.payerId).toBe(CONSUMER);
    expect(payment.payeeId).toBe(PRODUCER);
    expect(payment.paymentDate).toBe("2026-12-01T06:00:00.000Z");
  });

  it("publishes an EUR invoice with no exchange rate and maps declined", async () => {
    const dataspace = createMockDataSpace();
    const store = new PublicationStore();
    const service = new PublicationService(store, dataspace);
    const bus = new InMemoryEventBus();
    const listener = new BillingEventsListener(bus, service);
    await listener.onModuleInit();

    await bus.publish(
      "InvoiceIssued",
      envelope("InvoiceIssued", "AC-06", {
        invoiceId: INVOICE_ID,
        issuerId: PRODUCER,
        recipientId: CONSUMER,
        settlementId: SETTLEMENT_ID,
        dueDate: "2026-12-15",
        billingPeriodFrom: "2026-11-01T00:00:00.000Z",
        billingPeriodUntil: "2026-12-01T00:00:00.000Z",
        settlementType: "early",
        totalEnergyKWh: "1.000",
        vatRate: 0,
        carriedForwardAmount: "0.00",
        exchangeRate: null,
        amounts: { energy: "2.00", vat: "0.00", total: "2.00" },
        currency: "EUR",
        tradeIds: ["0x1a2b3c4d5e6f708192a3b4c5d6e7f809"],
      }),
    );
    await bus.publish(
      "PaymentStatusChanged",
      envelope("PaymentStatusChanged", "AC-07", {
        paymentId: FAILED_PAYMENT_ID,
        invoiceId: INVOICE_ID,
        payerId: CONSUMER,
        payeeId: PRODUCER,
        status: "failed",
        failureCategory: "declined",
        method: "card",
        currency: "EUR",
        amount: "2.00",
      }),
    );

    expect(store.listOutbound().every((row) => row.status === "published")).toBe(
      true,
    );
    const invoice = dataspace
      .recorded()
      .find((row) => row.topic === "billingInvoice")!.message as Record<
      string,
      unknown
    >;
    expect(invoice.exchangeRate).toBeNull();
    const payment = dataspace
      .recorded()
      .find((row) => row.topic === "billingPayment")!.message as Record<
      string,
      unknown
    >;
    expect(payment.failureCategory).toBe("card_declined");
    expect(payment.paymentDate).toBeNull();
  });
});
