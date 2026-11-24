/**
 * INT-110 — AC-11 payment notices (REQ-017, UAT-017).
 * INT-428 Task 2.15 — invoice PDF e-mail on issue (REQ-039, UAT-050).
 */
import "reflect-metadata";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  IdempotentConsumer,
  InMemoryProcessedEventsStore,
} from "@intelligent/module-template";
import { NotificationStore } from "../domain/store.js";
import { MailpitCatcherAdapter } from "../mail/mailpit-catcher.adapter.js";
import {
  MapInvoiceDocument,
  NullInvoiceDocument,
} from "../ports/invoice-document.port.js";
import { MapRecipient } from "../ports/recipient.port.js";
import { NotificationService } from "./notification.service.js";

const PARTICIPANT = "11111111-2222-4333-8444-555555555555";
const CONSUMER = "11111111-2222-4333-8444-555555555501";
const PRODUCER = "11111111-2222-4333-8444-555555555502";
const COMMUNITY = "c0ffee00-1234-4abc-8def-0123456789ab";
const INVOICE = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const LEGAL = "SB-66666666-000001";

describe("NotificationService", () => {
  let store: NotificationStore;
  let mail: MailpitCatcherAdapter;
  let service: NotificationService;

  beforeEach(() => {
    store = new NotificationStore();
    mail = new MailpitCatcherAdapter();
    service = new NotificationService(
      store,
      mail,
      new IdempotentConsumer(new InMemoryProcessedEventsStore()),
    );
    service.registerRecipient(PARTICIPANT, "member@example.com");
  });

  it("captures success and failure notices in Mailpit catcher (REQ-017, UAT-017)", async () => {
    await service.onPaymentStatusChanged({
      eventId: "11111111-1111-4111-8111-111111111111",
      paymentId: "pay-ok",
      invoiceId: "inv-1",
      status: "succeeded",
      participantId: PARTICIPANT,
      communityId: COMMUNITY,
    });
    await service.onPaymentStatusChanged({
      eventId: "22222222-2222-4222-8222-222222222222",
      paymentId: "pay-fail",
      invoiceId: "inv-2",
      status: "failed",
      failureCategory: "card_declined",
      participantId: PARTICIPANT,
      communityId: COMMUNITY,
    });

    const captured = service.capturedMail();
    expect(captured).toHaveLength(2);
    expect(captured.map((m) => m.template).sort()).toEqual([
      "payment-failure",
      "payment-success",
    ]);
    expect(captured.every((m) => m.to === "member@example.com")).toBe(true);
    expect(captured.some((m) => m.body.includes("pay-ok"))).toBe(true);
    expect(captured.some((m) => m.body.includes("card_declined"))).toBe(true);

    const logs = service.listLogs();
    expect(logs).toHaveLength(2);
    // Identifiers only — no e-mail in NotificationLog.
    expect(JSON.stringify(logs)).not.toContain("member@example.com");
    expect(logs.every((l) => l.paymentId && l.invoiceId && l.participantId)).toBe(
      true,
    );
  });

  it("ignores non-final statuses", async () => {
    await service.onPaymentStatusChanged({
      eventId: "33333333-3333-4333-8333-333333333333",
      paymentId: "pay-pending",
      invoiceId: "inv-3",
      status: "pending",
      participantId: PARTICIPANT,
      communityId: COMMUNITY,
    });
    expect(service.capturedMail()).toHaveLength(0);
    expect(service.listLogs()).toHaveLength(0);
  });

  it("deduplicates on eventId", async () => {
    const event = {
      eventId: "44444444-4444-4444-8444-444444444444",
      paymentId: "pay-dup",
      invoiceId: "inv-4",
      status: "succeeded" as const,
      participantId: PARTICIPANT,
      communityId: COMMUNITY,
    };
    expect(await service.onPaymentStatusChanged(event)).toEqual({
      status: "processed",
    });
    expect(await service.onPaymentStatusChanged(event)).toEqual({
      status: "duplicate",
    });
    expect(service.capturedMail()).toHaveLength(1);
  });

  it("INT-274: fail-soft when recipient is unknown", async () => {
    await expect(
      service.onPaymentStatusChanged({
        eventId: "55555555-5555-4555-8555-555555555555",
        paymentId: "pay-x",
        invoiceId: "inv-x",
        status: "succeeded",
        participantId: "unknown-participant",
        communityId: COMMUNITY,
      }),
    ).resolves.toEqual({ status: "processed" });
    expect(service.capturedMail()).toHaveLength(0);
  });

  it("INT-274: resolves recipient via RecipientPort (AC-03)", async () => {
    const recipients = {
      async resolveEmail(id: string) {
        return id === PARTICIPANT ? "from-ac03@example.com" : null;
      },
      async resolveCommunityManagerEmail() {
        return null;
      },
    };
    service = new NotificationService(
      store,
      mail,
      new IdempotentConsumer(new InMemoryProcessedEventsStore()),
      recipients,
    );
    await service.onPaymentStatusChanged({
      eventId: "66666666-6666-4666-8666-666666666666",
      paymentId: "pay-ac03",
      invoiceId: "inv-ac03",
      status: "succeeded",
      participantId: PARTICIPANT,
      communityId: COMMUNITY,
    });
    expect(service.capturedMail()[0]?.to).toBe("from-ac03@example.com");
  });

  it("UAT-057 UE-3 failure e-mail states the cause and the corrective action", async () => {
    await service.onPaymentStatusChanged({
      eventId: "77777777-7777-4777-8777-777777777777",
      paymentId: "pay-ue3",
      invoiceId: "inv-ue3",
      status: "failed",
      failureCategory: "insufficient_funds",
      participantId: PARTICIPANT,
      communityId: COMMUNITY,
    });
    const sent = service.capturedMail();
    expect(sent[0]).toMatchObject({ template: "payment-failure" });
    expect(sent[0].body).toContain("failureCategory=insufficient_funds");
    expect(sent[0].body).toContain(
      "correctiveAction=Top up the account or choose another payment method, then pay again",
    );
  });
});

describe("NotificationService.onInvoiceIssued (INT-428 / UAT-050)", () => {
  let store: NotificationStore;
  let mail: MailpitCatcherAdapter;
  let docs: MapInvoiceDocument;
  let service: NotificationService;

  const baseEvent = {
    eventId: "88888888-8888-4888-8888-888888888888",
    invoiceId: INVOICE,
    issuerId: PRODUCER,
    recipientId: CONSUMER,
    communityId: COMMUNITY,
    dueDate: "2026-12-15",
    total: "10.00",
    currency: "EUR",
  };

  beforeEach(() => {
    store = new NotificationStore();
    mail = new MailpitCatcherAdapter();
    docs = new MapInvoiceDocument();
    docs.put(INVOICE, {
      legalNumber: LEGAL,
      content: Buffer.from("%PDF-1.4"),
    });
    service = new NotificationService(
      store,
      mail,
      new IdempotentConsumer(new InMemoryProcessedEventsStore()),
      null,
      docs,
    );
    service.registerRecipient(CONSUMER, "consumer@example.invalid");
    service.registerRecipient(PRODUCER, "producer@example.invalid");
  });

  it("UAT-050 e-mails the PDF to the consumer and a copy to the producer", async () => {
    await service.onInvoiceIssued(baseEvent);
    const captured = service.capturedMail();
    expect(captured).toHaveLength(2);
    expect(captured.every((m) => m.template === "invoice-issued")).toBe(true);
    expect(captured.map((m) => m.to).sort()).toEqual([
      "consumer@example.invalid",
      "producer@example.invalid",
    ]);
    expect(captured[0]?.attachments?.[0]?.filename).toBe(`${LEGAL}.pdf`);
    expect(service.listLogs().every((l) => l.paymentId === null)).toBe(true);
    expect(service.listLogs().every((l) => l.status === "issued")).toBe(true);
  });

  it("is idempotent on eventId", async () => {
    expect(await service.onInvoiceIssued(baseEvent)).toEqual({
      status: "processed",
    });
    expect(await service.onInvoiceIssued(baseEvent)).toEqual({
      status: "duplicate",
    });
    expect(service.capturedMail()).toHaveLength(2);
  });

  it("redelivers when the document is not yet readable", async () => {
    service = new NotificationService(
      store,
      mail,
      new IdempotentConsumer(new InMemoryProcessedEventsStore()),
      null,
      new NullInvoiceDocument(),
    );
    await expect(service.onInvoiceIssued(baseEvent)).rejects.toThrow(
      /not yet readable/,
    );
    expect(service.capturedMail()).toHaveLength(0);
  });

  it("skips a party with missing e-mail and still mails the other", async () => {
    store = new NotificationStore();
    mail = new MailpitCatcherAdapter();
    service = new NotificationService(
      store,
      mail,
      new IdempotentConsumer(new InMemoryProcessedEventsStore()),
      null,
      docs,
    );
    service.registerRecipient(CONSUMER, "consumer@example.invalid");
    // producer e-mail deliberately missing
    await service.onInvoiceIssued({
      ...baseEvent,
      eventId: "99999999-9999-4999-8999-999999999999",
    });
    expect(service.capturedMail()).toHaveLength(1);
    expect(service.capturedMail()[0]?.to).toBe("consumer@example.invalid");
  });
});

describe("NotificationService reminders and overdue (INT-428 / UAT-078)", () => {
  let store: NotificationStore;
  let mail: MailpitCatcherAdapter;
  let docs: MapInvoiceDocument;
  let service: NotificationService;
  const prevAlertTo = process.env.OPERATOR_ALERT_TO;

  const reminderEvent = {
    eventId: "a1111111-1111-4111-8111-111111111111",
    invoiceId: INVOICE,
    recipientId: CONSUMER,
    communityId: COMMUNITY,
    dueDate: "2026-12-15",
    outstanding: "10.00",
    currency: "EUR",
    reminderNumber: 1,
  };

  const overdueEvent = {
    eventId: "b2222222-2222-4222-8222-222222222222",
    invoiceId: INVOICE,
    communityId: COMMUNITY,
    outstanding: "10.00",
    dueDate: "2026-12-15",
  };

  beforeEach(() => {
    store = new NotificationStore();
    mail = new MailpitCatcherAdapter();
    docs = new MapInvoiceDocument();
    docs.put(INVOICE, {
      legalNumber: LEGAL,
      content: Buffer.from("%PDF-1.4"),
    });
    delete process.env.OPERATOR_ALERT_TO;
    const recipients = new MapRecipient(new Map());
    service = new NotificationService(
      store,
      mail,
      new IdempotentConsumer(new InMemoryProcessedEventsStore()),
      recipients,
      docs,
    );
    service.registerRecipient(CONSUMER, "consumer@example.invalid");
    service.registerCommunityManager(COMMUNITY, "manager@example.invalid");
  });

  afterEach(() => {
    if (prevAlertTo === undefined) delete process.env.OPERATOR_ALERT_TO;
    else process.env.OPERATOR_ALERT_TO = prevAlertTo;
  });

  it("UAT-078 participant receives the reminder with the PDF", async () => {
    await service.onPaymentReminderRequested(reminderEvent);
    const captured = service.capturedMail();
    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({
      template: "payment-reminder",
      to: "consumer@example.invalid",
      subject: `Payment reminder 1 for invoice ${INVOICE}`,
    });
    expect(captured[0]?.body).toContain("outstanding=10.00 EUR");
    expect(captured[0]?.body).toContain("dueDate=2026-12-15");
    expect(captured[0]?.attachments?.[0]?.filename).toBe(`${LEGAL}.pdf`);
    expect(service.listLogs()[0]?.status).toBe("reminder");
  });

  it("UAT-078 manager receives a missing-payment alert when the invoice turns Overdue", async () => {
    await service.onInvoiceOverdue(overdueEvent);
    const captured = service.capturedMail();
    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({
      template: "missing-payment-alert",
      to: "manager@example.invalid",
      subject: `Missing payment: invoice ${INVOICE}`,
    });
    expect(service.listLogs()[0]?.status).toBe("overdue");
  });

  it("falls back to OPERATOR_ALERT_TO without manager contact", async () => {
    process.env.OPERATOR_ALERT_TO = "ops@example.invalid";
    const recipients = {
      async resolveEmail() {
        return null;
      },
      async resolveCommunityManagerEmail() {
        return null;
      },
    };
    service = new NotificationService(
      store,
      mail,
      new IdempotentConsumer(new InMemoryProcessedEventsStore()),
      recipients,
      docs,
    );
    await service.onInvoiceOverdue({
      ...overdueEvent,
      eventId: "c3333333-3333-4333-8333-333333333333",
    });
    expect(service.capturedMail()).toHaveLength(1);
    expect(service.capturedMail()[0]?.to).toBe("ops@example.invalid");
    expect(service.capturedMail()[0]?.template).toBe("missing-payment-alert");
  });

  it("skips overdue alert when no manager contact and OPERATOR_ALERT_TO unset", async () => {
    const recipients = {
      async resolveEmail() {
        return null;
      },
      async resolveCommunityManagerEmail() {
        return null;
      },
    };
    service = new NotificationService(
      store,
      mail,
      new IdempotentConsumer(new InMemoryProcessedEventsStore()),
      recipients,
      docs,
    );
    await expect(
      service.onInvoiceOverdue({
        ...overdueEvent,
        eventId: "d4444444-4444-4444-8444-444444444444",
      }),
    ).resolves.toEqual({ status: "processed" });
    expect(service.capturedMail()).toHaveLength(0);
  });

  it("redelivers reminder when the document is not yet readable", async () => {
    service = new NotificationService(
      store,
      mail,
      new IdempotentConsumer(new InMemoryProcessedEventsStore()),
      new MapRecipient(new Map([[CONSUMER, "consumer@example.invalid"]])),
      new NullInvoiceDocument(),
    );
    await expect(
      service.onPaymentReminderRequested({
        ...reminderEvent,
        eventId: "e5555555-5555-4555-8555-555555555555",
      }),
    ).rejects.toThrow(/not yet readable/);
    expect(service.capturedMail()).toHaveLength(0);
  });

  it("skips reminder when consumer e-mail is missing", async () => {
    const emptyMail = new MailpitCatcherAdapter();
    service = new NotificationService(
      new NotificationStore(),
      emptyMail,
      new IdempotentConsumer(new InMemoryProcessedEventsStore()),
      new MapRecipient(new Map()),
      docs,
    );
    await expect(
      service.onPaymentReminderRequested({
        ...reminderEvent,
        eventId: "f6666666-6666-4666-8666-666666666666",
      }),
    ).resolves.toEqual({ status: "processed" });
    expect(emptyMail.captured()).toHaveLength(0);
  });

  it("overdue alert body omits dueDate when absent", async () => {
    await service.onInvoiceOverdue({
      eventId: "a7777777-7777-4777-8777-777777777777",
      invoiceId: INVOICE,
      communityId: COMMUNITY,
      outstanding: "5.00",
    });
    expect(service.capturedMail()[0]?.body).toContain("outstanding=5.00");
    expect(service.capturedMail()[0]?.body).not.toContain("dueDate=");
  });
});
