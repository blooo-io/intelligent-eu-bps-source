import { describe, expect, it, vi } from "vitest";
import {
  createConnectedCustomersStore,
  InMemoryConnectedCustomersStore,
  PostgresConnectedCustomersStore,
} from "./connected-customers.store.js";

describe("UAT-014 REQ-014 connected-account Customer mapping (INT-355)", () => {
  it("selects in-memory or Postgres from DATABASE_URL", () => {
    expect(createConnectedCustomersStore({})).toBeInstanceOf(InMemoryConnectedCustomersStore);
    expect(
      createConnectedCustomersStore({ DATABASE_URL: "postgresql://payments:x@localhost/payments" }),
    ).toBeInstanceOf(PostgresConnectedCustomersStore);
  });

  it("keeps one Customer per participant and connected account", async () => {
    const store = new InMemoryConnectedCustomersStore();
    const first = await store.putIfAbsent({
      participantId: "p1", pspAccountRef: "acct_1", pspCustomerRef: "cus_a",
    });
    const raced = await store.putIfAbsent({
      participantId: "p1", pspAccountRef: "acct_1", pspCustomerRef: "cus_b",
    });
    expect(raced).toEqual(first);
    expect(await store.get("p1", "acct_2")).toBeUndefined();
    store.reset();
    expect(await store.get("p1", "acct_1")).toBeUndefined();
  });

  it("Postgres store inserts once and returns the stored row", async () => {
    let stored: Record<string, string> | undefined;
    const query = vi.fn(async (sql: string, params?: string[]) => {
      if (sql.includes("INSERT") && !stored && params) {
        stored = { participant_id: params[0]!, psp_account_ref: params[1]!, psp_customer_ref: params[2]! };
      }
      if (sql.includes("SELECT")) return { rows: stored ? [stored] : [] };
      return { rows: [] };
    });
    const store = new PostgresConnectedCustomersStore({ query } as never);
    expect(await store.get("p1", "acct_1")).toBeUndefined();
    await store.putIfAbsent({ participantId: "p1", pspAccountRef: "acct_1", pspCustomerRef: "cus_a" });
    const raced = await store.putIfAbsent({
      participantId: "p1", pspAccountRef: "acct_1", pspCustomerRef: "cus_b",
    });
    expect(raced.pspCustomerRef).toBe("cus_a");
    const schemaSql = String(query.mock.calls.find(([sql]) => String(sql).includes("CREATE TABLE"))?.[0] ?? "");
    expect(schemaSql).toMatch(/RENAME COLUMN stripe_account_id TO psp_account_ref/);
    expect(schemaSql).toMatch(/RENAME COLUMN stripe_customer_id TO psp_customer_ref/);
  });

  it("Postgres store echoes the row when the read-back is empty", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const store = new PostgresConnectedCustomersStore({ query } as never);
    await expect(
      store.putIfAbsent({ participantId: "p1", pspAccountRef: "acct_1", pspCustomerRef: "cus_a" }),
    ).resolves.toEqual({ participantId: "p1", pspAccountRef: "acct_1", pspCustomerRef: "cus_a" });
  });
});
