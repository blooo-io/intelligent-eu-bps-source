import { describe, expect, it, vi } from "vitest";
import {
  createConnectedCustomersStore,
  InMemoryConnectedCustomersStore,
  PostgresConnectedCustomersStore,
} from "./connected-customers.store.js";

describe("UAT-014 REQ-014 connected-account Customer mapping (INT-355)", () => {
  it("selects in-memory or Postgres from DATABASE_URL", () => {
    expect(createConnectedCustomersStore({})).toBeInstanceOf(
      InMemoryConnectedCustomersStore,
    );
    expect(
      createConnectedCustomersStore({
        DATABASE_URL: "postgresql://payments:x@localhost/payments",
      }),
    ).toBeInstanceOf(PostgresConnectedCustomersStore);
  });

  it("keeps one Customer per participant and connected account", async () => {
    const store = new InMemoryConnectedCustomersStore();
    const first = await store.putIfAbsent({
      participantId: "p1",
      stripeAccountId: "acct_1",
      stripeCustomerId: "cus_a",
    });
    const raced = await store.putIfAbsent({
      participantId: "p1",
      stripeAccountId: "acct_1",
      stripeCustomerId: "cus_b",
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
        stored = {
          participant_id: params[0]!,
          stripe_account_id: params[1]!,
          stripe_customer_id: params[2]!,
        };
      }
      if (sql.includes("SELECT")) return { rows: stored ? [stored] : [] };
      return { rows: [] };
    });
    const store = new PostgresConnectedCustomersStore({ query } as never);
    expect(await store.get("p1", "acct_1")).toBeUndefined();
    await store.putIfAbsent({ participantId: "p1", stripeAccountId: "acct_1", stripeCustomerId: "cus_a" });
    const raced = await store.putIfAbsent({
      participantId: "p1",
      stripeAccountId: "acct_1",
      stripeCustomerId: "cus_b",
    });
    expect(raced.stripeCustomerId).toBe("cus_a");
    expect(query.mock.calls.filter(([sql]) => sql.includes("CREATE TABLE"))).toHaveLength(1);
  });

  it("Postgres store echoes the row when the read-back is empty", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const store = new PostgresConnectedCustomersStore({ query } as never);
    await expect(
      store.putIfAbsent({ participantId: "p1", stripeAccountId: "acct_1", stripeCustomerId: "cus_a" }),
    ).resolves.toEqual({ participantId: "p1", stripeAccountId: "acct_1", stripeCustomerId: "cus_a" });
  });
});
