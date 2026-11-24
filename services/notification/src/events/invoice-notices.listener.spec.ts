/**
 * INT-428 Task 2.15 — InvoiceIssued listener + e-mail with PDF (REQ-039, UAT-050, NFR-015).
 */
import "reflect-metadata";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
