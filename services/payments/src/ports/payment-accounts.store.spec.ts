import { describe, expect, it, vi } from "vitest";
import {
  createPaymentAccountsStore,
  InMemoryPaymentAccountsStore,
  PostgresPaymentAccountsStore,
} from "./payment-accounts.store.js";

describe("createPaymentAccountsStore (INT-228)", () => {
  it("uses in-memory without DATABASE_URL", () => {
    expect(createPaymentAccountsStore({})).toBeInstanceOf(InMemoryPaymentAccountsStore);
  });
  it("uses Postgres when DATABASE_URL is set", () => {
    expect(
      createPaymentAccountsStore({ DATABASE_URL: "postgresql://payments:x@localhost/payments" }),
    ).toBeInstanceOf(PostgresPaymentAccountsStore);
  });
  it("round-trips an account row with pspAccountRef", async () => {
    const store = new InMemoryPaymentAccountsStore();
    await store.put({
      participantId: "66666666-7777-4888-9999-aaaaaaaaaaaa",
      pspAccountRef: "mock_acct_1",
      pspPaymentMethodRef: null,
      kycStatus: "verified",
      role: "producer",
      communityId: "c0ffee00-1234-4abc-8def-0123456789ab",
    });
    const got = await store.get("66666666-7777-4888-9999-aaaaaaaaaaaa");
    expect(got?.pspAccountRef).toBe("mock_acct_1");
    store.reset();
    expect(await store.get("66666666-7777-4888-9999-aaaaaaaaaaaa")).toBeUndefined();
  });
  it("Postgres schema renames legacy stripe_account_id column", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("CREATE TABLE") || sql.includes("RENAME COLUMN")) return { rows: [] };
      if (sql.includes("SELECT")) {
        return {
          rows: [{
            participant_id: "p1",
            psp_account_ref: "acct_pg",
            psp_payment_method_ref: null,
            kyc_status: "verified",
            role: "producer",
            community_id: "c1",
          }],
        };
      }
      return { rows: [] };
    });
    const store = new PostgresPaymentAccountsStore({ query } as never);
    expect((await store.get("p1"))?.pspAccountRef).toBe("acct_pg");
    expect(String(query.mock.calls[0]?.[0] ?? "")).toMatch(/RENAME COLUMN stripe_account_id TO psp_account_ref/);
    await store.put({
      participantId: "p1",
      pspAccountRef: "acct_pg2",
      pspPaymentMethodRef: null,
      kycStatus: "pending",
      role: "producer",
      communityId: "c1",
    });
  });
});
