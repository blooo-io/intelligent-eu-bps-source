import { describe, expect, it } from "vitest";
import type { SqlExecutor } from "../outbox/postgres-outbox.store.js";
import { PostgresProcessedEventsStore } from "./postgres-processed-events.store.js";

function memorySql(): SqlExecutor & { rows: Set<string> } {
  const rows = new Set<string>();
  return {
    rows,
    async query(text: string, params?: unknown[]) {
      const id = String(params?.[0] ?? "");
      if (text.startsWith("SELECT")) {
        return { rows: rows.has(id) ? [{ event_id: id }] : [] };
      }
      if (text.includes("INSERT")) {
        if (rows.has(id)) return { rows: [] };
        rows.add(id);
        return { rows: [{ event_id: id }] };
      }
      rows.delete(id);
      return { rows: [] };
    },
  };
}

describe("PostgresProcessedEventsStore (INT-339)", () => {
  it("claims once, reports a duplicate, and releases a failed claim", async () => {
    const sql = memorySql();
    const store = new PostgresProcessedEventsStore(sql);
    await expect(store.claim("evt-1")).resolves.toBe(true);
    await expect(store.claim("evt-1")).resolves.toBe(false);
    await expect(store.has("evt-1")).resolves.toBe(true);
    await store.release("evt-1");
    await expect(store.has("evt-1")).resolves.toBe(false);
    await expect(store.claim("evt-1")).resolves.toBe(true);
  });
});
