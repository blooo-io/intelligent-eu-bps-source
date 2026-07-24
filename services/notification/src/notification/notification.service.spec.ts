/**
 * INT-110 — AC-11 payment notices (REQ-017, UAT-017).
 */
import "reflect-metadata";
import { beforeEach, describe, expect, it } from "vitest";
import {
  IdempotentConsumer,
  InMemoryProcessedEventsStore,
} from "@intelligent/module-template";
import { NotificationStore } from "../domain/store.js";
import { MailpitCatcherAdapter } from "../mail/mailpit-catcher.adapter.js";
import { NotificationService } from "./notification.service.js";

const PARTICIPANT = "11111111-2222-4333-8444-555555555555";
const COMMUNITY = "c0ffee00-1234-4abc-8def-0123456789ab";

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
});
