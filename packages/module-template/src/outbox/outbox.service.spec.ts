import { describe, expect, it } from "vitest";
import { OutboxService } from "./outbox.service.js";
import { InMemoryOutboxStore } from "./outbox.types.js";

describe("OutboxService (NFR-003 / UAT-035)", () => {
  it("stage builds the row without writing (INT-356)", async () => {
    const store = new InMemoryOutboxStore();
    const outbox = new OutboxService(store);
    const staged = outbox.stage({
      aggregateType: "Invoice",
      aggregateId: "inv-1",
      type: "InvoiceIssued",
      producer: "AC-06",
      communityId: "com",
      billingMode: "virtual",
      data: { invoiceId: "inv-1" },
    });
    expect(staged.event.type).toBe("InvoiceIssued");
    expect(staged.row.event).toBe(staged.event);
    expect(await store.list()).toEqual([]);
  });
  it("appends an immutable outbox row with the domain envelope", async () => {
    const store = new InMemoryOutboxStore();
    const outbox = new OutboxService(store);

    const event = await outbox.append({
      aggregateType: "Invoice",
      aggregateId: "inv-1",
      type: "InvoiceIssued",
      producer: "AC-06",
      communityId: "22222222-2222-2222-2222-222222222222",
      billingMode: "virtual",
      data: { invoiceId: "inv-1" },
      eventId: "33333333-3333-3333-3333-333333333333",
      occurredAt: "2026-10-16T12:00:00.000Z",
    });

    expect(event.version).toBe(1);
    expect(event.type).toBe("InvoiceIssued");
    const rows = await store.list();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.event.eventId).toBe(event.eventId);
  });

  it("exposes no update API on the outbox store (append-only)", () => {
    const store = new InMemoryOutboxStore();
    expect("update" in store).toBe(false);
    expect("delete" in store).toBe(false);
    expect(typeof store.append).toBe("function");
  });

  it("generates eventId and occurredAt when omitted", async () => {
    const store = new InMemoryOutboxStore();
    const outbox = new OutboxService(store);
    const event = await outbox.append({
      aggregateType: "Payment",
      aggregateId: "pay-1",
      type: "PaymentSucceeded",
      producer: "AC-07",
      communityId: "22222222-2222-2222-2222-222222222222",
      billingMode: "virtual",
      data: { paymentId: "pay-1" },
    });
    expect(event.eventId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(Date.parse(event.occurredAt)).not.toBeNaN();
  });
});
