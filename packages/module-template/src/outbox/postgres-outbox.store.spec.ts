import { describe, expect, it, vi } from "vitest";
import { InMemoryOutboxStore } from "./outbox.types.js";
import {
  PostgresOutboxStore,
  resolveOutboxStore,
  type SqlExecutor,
} from "./postgres-outbox.store.js";

const sampleRow = {
  id: "11111111-1111-4111-8111-111111111111",
  aggregateType: "Invoice",
  aggregateId: "inv-1",
  event: {
    eventId: "22222222-2222-4222-8222-222222222222",
    type: "InvoiceIssued",
    version: 1 as const,
    occurredAt: "2026-10-18T12:00:00.000Z",
    producer: "invoicing",
    communityId: "com-1",
    billingMode: "virtual" as const,
    data: { invoiceId: "inv-1" },
  },
  createdAt: "2026-10-18T12:00:00.000Z",
};

describe("PostgresOutboxStore (INT-207 / TD-7)", () => {
  it("inserts JSONB event on append", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const sql: SqlExecutor = { query };
    const store = new PostgresOutboxStore(sql);
    await store.append(sampleRow);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO outbox"),
      [
        sampleRow.id,
        sampleRow.aggregateType,
        sampleRow.aggregateId,
        JSON.stringify(sampleRow.event),
        sampleRow.createdAt,
      ],
    );
  });

  it("maps list rows from Postgres column names", async () => {
    const sql: SqlExecutor = {
      query: async () => ({
        rows: [
          {
            id: sampleRow.id,
            aggregate_type: sampleRow.aggregateType,
            aggregate_id: sampleRow.aggregateId,
            event: sampleRow.event,
            created_at: new Date(sampleRow.createdAt),
          },
        ],
      }),
    };
    const store = new PostgresOutboxStore(sql);
    const rows = await store.list();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(sampleRow);
  });

  it("resolveOutboxStore keeps memory when DATABASE_URL is empty", () => {
    const memory = new InMemoryOutboxStore();
    const resolved = resolveOutboxStore({ memory, databaseUrl: "" });
    expect(resolved).toBe(memory);
  });

  it("resolveOutboxStore uses Postgres when URL and factory are set", () => {
    const createSql = vi.fn(() => ({
      query: async () => ({ rows: [] }),
    }));
    const resolved = resolveOutboxStore({
      databaseUrl: "postgres://local/outbox",
      createSql,
      memory: new InMemoryOutboxStore(),
    });
    expect(createSql).toHaveBeenCalledWith("postgres://local/outbox");
    expect(resolved).toBeInstanceOf(PostgresOutboxStore);
  });

  it("parses string JSON event payloads from drivers", async () => {
    const sql: SqlExecutor = {
      query: async () => ({
        rows: [
          {
            id: sampleRow.id,
            aggregate_type: sampleRow.aggregateType,
            aggregate_id: sampleRow.aggregateId,
            event: JSON.stringify(sampleRow.event),
            created_at: sampleRow.createdAt,
          },
        ],
      }),
    };
    const rows = await new PostgresOutboxStore(sql).list();
    expect(rows[0]?.event.type).toBe("InvoiceIssued");
  });

  it("resolveOutboxStore throws without memory when URL is unset", () => {
    expect(() => resolveOutboxStore({ databaseUrl: "" })).toThrow(/memory store/);
  });
});
