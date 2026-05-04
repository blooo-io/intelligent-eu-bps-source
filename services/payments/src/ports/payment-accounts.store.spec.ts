import { describe, expect, it, vi } from "vitest";
import {
  createPaymentAccountsStore,
  InMemoryPaymentAccountsStore,
  PostgresPaymentAccountsStore,
} from "./payment-accounts.store.js";

describe("createPaymentAccountsStore (INT-228)", () => {
  it("uses in-memory without DATABASE_URL", () => {
    expect(createPaymentAccountsStore({})).toBeInstanceOf(
      InMemoryPaymentAccountsStore,
    );
  });

  it("uses Postgres when DATABASE_URL is set", () => {
    expect(
      createPaymentAccountsStore({
        DATABASE_URL: "postgresql://payments:x@localhost/payments",
      }),
    ).toBeInstanceOf(PostgresPaymentAccountsStore);
  });

  it("round-trips an account row", async () => {
    const store = new InMemoryPaymentAccountsStore();
    await store.put({
      participantId: "66666666-7777-4888-9999-aaaaaaaaaaaa",
      stripeAccountId: "acct_fresh_1",
      paymentMethodId: null,
      kycStatus: "verified",
      role: "producer",
      communityId: "c0ffee00-1234-4abc-8def-0123456789ab",
    });
    const got = await store.get("66666666-7777-4888-9999-aaaaaaaaaaaa");
    expect(got?.stripeAccountId).toBe("acct_fresh_1");
    expect(got?.kycStatus).toBe("verified");
    store.reset();
    expect(await store.get("66666666-7777-4888-9999-aaaaaaaaaaaa")).toBeUndefined();
  });

  it("PostgresPaymentAccountsStore maps rows via pool", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("CREATE TABLE")) return { rows: [] };
      if (sql.includes("SELECT")) {
        return {
          rows: [
            {
              participant_id: "p1",
              stripe_account_id: "acct_pg",
              payment_method_id: null,
              kyc_status: "verified",
              role: "producer",
              community_id: "c1",
            },
          ],
        };
      }
      return { rows: [] };
    });
    const store = new PostgresPaymentAccountsStore({ query } as never);
    const got = await store.get("p1");
    expect(got?.stripeAccountId).toBe("acct_pg");
    await store.put({
      participantId: "p1",
      stripeAccountId: "acct_pg2",
      paymentMethodId: null,
      kycStatus: "pending",
      role: "producer",
      communityId: "c1",
    });
    expect(query).toHaveBeenCalled();
  });
});
