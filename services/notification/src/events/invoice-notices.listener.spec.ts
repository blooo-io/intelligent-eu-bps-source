/**
 * INT-428 Task 2.15 / 2.17 — InvoiceIssued, reminders, overdue alerts
 * (REQ-039, UAT-050, REQ-061, UAT-078, NFR-015).
 */
import "reflect-metadata";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  IdempotentConsumer,
  InMemoryProcessedEventsStore,
} from "@intelligent/module-template";
import { NotificationStore } from "../domain/store.js";
import { MailpitCatcherAdapter } from "../mail/mailpit-catcher.adapter.js";
import { NotificationService } from "../notification/notification.service.js";
import {
  MapInvoiceDocument,
  NullInvoiceDocument,
} from "../ports/invoice-document.port.js";
import { MapRecipient } from "../ports/recipient.port.js";
import { InMemoryEventBus } from "./in-memory-event-bus.js";
import { InvoiceNoticesListener } from "./invoice-notices.listener.js";

const CONSUMER = "11111111-2222-4333-8444-555555555501";
const PRODUCER = "11111111-2222-4333-8444-555555555502";
const COMMUNITY = "c0ffee00-1234-4abc-8def-0123456789ab";
const INVOICE = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const LEGAL = "SB-66666666-000001";
const PDF = Buffer.from("%PDF-1.4 invoice");

function issuedEnvelope(eventId: string) {
  return {
    eventId,
    communityId: COMMUNITY,
    type: "InvoiceIssued",
    producer: "AC-06",
    data: {
      invoiceId: INVOICE,
      issuerId: PRODUCER,
      recipientId: CONSUMER,
      settlementId: "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff",
      dueDate: "2026-12-15",
      amounts: {
        energy: "10.00",
        gridFee: "0.00",
        levy: "0.00",
        tax: "0.00",
        vat: "0.00",
        total: "10.00",
      },
      currency: "EUR",
      tariffApplied: false,
    },
  };
}

function reminderEnvelope(eventId: string) {
  return {
    eventId,
    communityId: COMMUNITY,
    type: "PaymentReminderRequested",
    producer: "AC-06",
    data: {
      invoiceId: INVOICE,
      recipientId: CONSUMER,
      communityId: COMMUNITY,
      dueDate: "2026-12-15",
      outstanding: "10.00",
      currency: "EUR",
      reminderNumber: 2,
      trigger: "manual",
    },
  };
}

function statusEnvelope(
  eventId: string,
  status: string,
  extras: Record<string, unknown> = {},
) {
  return {
    eventId,
    communityId: COMMUNITY,
    type: "InvoiceStatusChanged",
    producer: "AC-06",
    data: {
      invoiceId: INVOICE,
      status,
      outstanding: "10.00",
      dueDate: "2026-12-15",
      ...extras,
    },
  };
}

describe("InvoiceNoticesListener (INT-428 / UAT-050)", () => {
  let bus: InMemoryEventBus;
  let mail: MailpitCatcherAdapter;
  let docs: MapInvoiceDocument;
  let service: NotificationService;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    bus = new InMemoryEventBus();
    mail = new MailpitCatcherAdapter();
    docs = new MapInvoiceDocument();
    docs.put(INVOICE, { legalNumber: LEGAL, content: PDF });
    const store = new NotificationStore();
    service = new NotificationService(
      store,
      mail,
      new IdempotentConsumer(new InMemoryProcessedEventsStore()),
      null,
      docs,
    );
    service.registerRecipient(CONSUMER, "consumer@example.invalid");
    service.registerRecipient(PRODUCER, "producer@example.invalid");
    const listener = new InvoiceNoticesListener(bus, service);
    await listener.onModuleInit();
    logSpy = vi.spyOn(service["logger"], "log").mockImplementation(() => undefined);
  });

  it("UAT-050 e-mails the PDF to the consumer and a copy to the producer", async () => {
    await bus.publish("InvoiceIssued", issuedEnvelope("e-uat-050-1"));

    const captured = mail.captured();
    expect(captured).toHaveLength(2);
    expect(captured.every((m) => m.template === "invoice-issued")).toBe(true);
    expect(captured.map((m) => m.to).sort()).toEqual([
      "consumer@example.invalid",
      "producer@example.invalid",
    ]);
    expect(
      captured.every(
        (m) => m.attachments?.[0]?.filename === `${LEGAL}.pdf`,
      ),
    ).toBe(true);

    const consumerMail = captured.find(
      (m) => m.to === "consumer@example.invalid",
    );
    expect(consumerMail?.subject).toBe(`Invoice ${LEGAL}`);
    expect(consumerMail?.body).toContain(`invoiceId=${INVOICE}`);
    expect(consumerMail?.body).toContain("total=10.00 EUR");
    expect(consumerMail?.body).toContain("dueDate=2026-12-15");

    const producerMail = captured.find(
      (m) => m.to === "producer@example.invalid",
    );
    expect(producerMail?.subject).toBe(
      `Copy of self-billed invoice ${LEGAL} issued in your name`,
    );
  });

  it("is idempotent on eventId", async () => {
    const envelope = issuedEnvelope("e-idempotent-1");
    await bus.publish("InvoiceIssued", envelope);
    await bus.publish("InvoiceIssued", envelope);
    expect(mail.captured()).toHaveLength(2);
  });

  it("redelivers when the document is not yet readable", async () => {
    const store = new NotificationStore();
    const failing = new NotificationService(
      store,
      mail,
      new IdempotentConsumer(new InMemoryProcessedEventsStore()),
      null,
      new NullInvoiceDocument(),
    );
    failing.registerRecipient(CONSUMER, "consumer@example.invalid");
    failing.registerRecipient(PRODUCER, "producer@example.invalid");
    const failBus = new InMemoryEventBus();
    const listener = new InvoiceNoticesListener(failBus, failing);
    await listener.onModuleInit();

    await expect(
      failBus.publish("InvoiceIssued", issuedEnvelope("e-redeliver-1")),
    ).rejects.toThrow(/not yet readable/);
    expect(mail.captured()).toHaveLength(0);
  });

  it("NFR-015 log carries identifiers only", async () => {
    await bus.publish("InvoiceIssued", issuedEnvelope("e-nfr-015-1"));
    const logged = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).not.toContain("@");
    expect(logged).toContain(INVOICE);
    expect(logged).toContain(CONSUMER);
  });

  it("maps AsyncAPI envelope and forwards to NotificationService", async () => {
    const onInvoiceIssued = vi.fn(async () => ({ status: "processed" }));
    const mapBus = new InMemoryEventBus();
    const listener = new InvoiceNoticesListener(mapBus, {
      onInvoiceIssued,
      onPaymentReminderRequested: vi.fn(),
      onInvoiceOverdue: vi.fn(),
    } as never);
    await listener.onModuleInit();

    await mapBus.publish("InvoiceIssued", issuedEnvelope("e-map-1"));

    expect(onInvoiceIssued).toHaveBeenCalledWith({
      eventId: "e-map-1",
      communityId: COMMUNITY,
      invoiceId: INVOICE,
      issuerId: PRODUCER,
      recipientId: CONSUMER,
      dueDate: "2026-12-15",
      total: "10.00",
      currency: "EUR",
    });
  });
});

describe("InvoiceNoticesListener reminders and overdue (INT-428 / UAT-078)", () => {
  let bus: InMemoryEventBus;
  let mail: MailpitCatcherAdapter;
  let service: NotificationService;
  const prevAlertTo = process.env.OPERATOR_ALERT_TO;

  beforeEach(async () => {
    bus = new InMemoryEventBus();
    mail = new MailpitCatcherAdapter();
    const docs = new MapInvoiceDocument();
    docs.put(INVOICE, { legalNumber: LEGAL, content: PDF });
    const recipients = new MapRecipient(new Map());
    const store = new NotificationStore();
    service = new NotificationService(
      store,
      mail,
      new IdempotentConsumer(new InMemoryProcessedEventsStore()),
      recipients,
      docs,
    );
    service.registerRecipient(CONSUMER, "consumer@example.invalid");
    service.registerCommunityManager(COMMUNITY, "manager@example.invalid");
    const listener = new InvoiceNoticesListener(bus, service);
    await listener.onModuleInit();
    delete process.env.OPERATOR_ALERT_TO;
  });

  afterEach(() => {
    if (prevAlertTo === undefined) delete process.env.OPERATOR_ALERT_TO;
    else process.env.OPERATOR_ALERT_TO = prevAlertTo;
  });

  it("UAT-078 participant receives the reminder with the PDF", async () => {
    await bus.publish("PaymentReminderRequested", reminderEnvelope("e-uat-078-r1"));
    const captured = mail.captured();
    expect(captured).toHaveLength(1);
    expect(captured[0]?.template).toBe("payment-reminder");
    expect(captured[0]?.to).toBe("consumer@example.invalid");
    expect(captured[0]?.subject).toBe(
      `Payment reminder 2 for invoice ${INVOICE}`,
    );
    expect(captured[0]?.attachments?.[0]?.filename).toBe(`${LEGAL}.pdf`);
    expect(captured[0]?.body).toContain("outstanding=10.00 EUR");
    expect(captured[0]?.body).toContain("dueDate=2026-12-15");
  });

  it("UAT-078 manager receives a missing-payment alert when the invoice turns Overdue", async () => {
    await bus.publish(
      "InvoiceStatusChanged",
      statusEnvelope("e-uat-078-o1", "Overdue"),
    );
    const captured = mail.captured();
    expect(captured).toHaveLength(1);
    expect(captured[0]?.to).toBe("manager@example.invalid");
    expect(captured[0]?.template).toBe("missing-payment-alert");
    expect(captured[0]?.subject).toBe(`Missing payment: invoice ${INVOICE}`);
  });

  it("ignores InvoiceStatusChanged other than Overdue", async () => {
    await bus.publish(
      "InvoiceStatusChanged",
      statusEnvelope("e-uat-078-paid", "Paid"),
    );
    expect(mail.captured()).toHaveLength(0);
  });

  it("falls back to OPERATOR_ALERT_TO without manager contact", async () => {
    process.env.OPERATOR_ALERT_TO = "ops@example.invalid";
    const docs = new MapInvoiceDocument();
    docs.put(INVOICE, { legalNumber: LEGAL, content: PDF });
    const recipients = new MapRecipient(new Map());
    const store = new NotificationStore();
    const fallbackService = new NotificationService(
      store,
      mail,
      new IdempotentConsumer(new InMemoryProcessedEventsStore()),
      recipients,
      docs,
    );
    const fallbackBus = new InMemoryEventBus();
    const listener = new InvoiceNoticesListener(fallbackBus, fallbackService);
    await listener.onModuleInit();

    await fallbackBus.publish(
      "InvoiceStatusChanged",
      statusEnvelope("e-uat-078-fallback", "Overdue"),
    );
    expect(mail.captured()).toHaveLength(1);
    expect(mail.captured()[0]?.to).toBe("ops@example.invalid");
  });

  it("maps PaymentReminderRequested envelope to the service", async () => {
    const onPaymentReminderRequested = vi.fn(async () => ({
      status: "processed",
    }));
    const mapBus = new InMemoryEventBus();
    const listener = new InvoiceNoticesListener(mapBus, {
      onInvoiceIssued: vi.fn(),
      onPaymentReminderRequested,
      onInvoiceOverdue: vi.fn(),
    } as never);
    await listener.onModuleInit();

    await mapBus.publish("PaymentReminderRequested", reminderEnvelope("e-map-r1"));

    expect(onPaymentReminderRequested).toHaveBeenCalledWith({
      eventId: "e-map-r1",
      invoiceId: INVOICE,
      recipientId: CONSUMER,
      communityId: COMMUNITY,
      dueDate: "2026-12-15",
      outstanding: "10.00",
      currency: "EUR",
      reminderNumber: 2,
    });
  });

  it("parses string reminderNumber and falls back communityId from envelope", async () => {
    const onPaymentReminderRequested = vi.fn(async () => ({
      status: "processed",
    }));
    const mapBus = new InMemoryEventBus();
    const listener = new InvoiceNoticesListener(mapBus, {
      onInvoiceIssued: vi.fn(),
      onPaymentReminderRequested,
      onInvoiceOverdue: vi.fn(),
    } as never);
    await listener.onModuleInit();

    await mapBus.publish("PaymentReminderRequested", {
      eventId: "e-map-r2",
      communityId: COMMUNITY,
      type: "PaymentReminderRequested",
      producer: "AC-06",
      data: {
        invoiceId: INVOICE,
        recipientId: CONSUMER,
        dueDate: "2026-12-15",
        outstanding: "10.00",
        currency: "EUR",
        reminderNumber: "3",
        trigger: "scheduled",
      },
    });

    expect(onPaymentReminderRequested).toHaveBeenCalledWith(
      expect.objectContaining({
        reminderNumber: 3,
        communityId: COMMUNITY,
      }),
    );
  });

  it("defaults invalid reminderNumber to 1 and omits blank dueDate on Overdue", async () => {
    const onPaymentReminderRequested = vi.fn(async () => ({
      status: "processed",
    }));
    const onInvoiceOverdue = vi.fn(async () => ({ status: "processed" }));
    const mapBus = new InMemoryEventBus();
    const listener = new InvoiceNoticesListener(mapBus, {
      onInvoiceIssued: vi.fn(),
      onPaymentReminderRequested,
      onInvoiceOverdue,
    } as never);
    await listener.onModuleInit();

    await mapBus.publish("PaymentReminderRequested", {
      eventId: "e-map-r3",
      communityId: COMMUNITY,
      data: {
        invoiceId: INVOICE,
        recipientId: CONSUMER,
        communityId: COMMUNITY,
        dueDate: "2026-12-15",
        outstanding: "1.00",
        currency: "EUR",
        reminderNumber: "nope",
        trigger: "manual",
      },
    });
    expect(onPaymentReminderRequested).toHaveBeenCalledWith(
      expect.objectContaining({ reminderNumber: 1 }),
    );

    await mapBus.publish(
      "InvoiceStatusChanged",
      statusEnvelope("e-map-o1", "Overdue", { dueDate: "   " }),
    );
    expect(onInvoiceOverdue).toHaveBeenCalledWith({
      eventId: "e-map-o1",
      invoiceId: INVOICE,
      communityId: COMMUNITY,
      outstanding: "10.00",
      dueDate: undefined,
    });
  });
});
