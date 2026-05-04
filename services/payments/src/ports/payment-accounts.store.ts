import pg, { type Pool } from "pg";
import type { AccountRecord } from "../domain/store.js";

export const PAYMENT_ACCOUNTS_STORE = Symbol("PAYMENT_ACCOUNTS_STORE");

/**
 * INT-228 — durable participant → Stripe Connect / PM binding so restarts
 * keep consuming real Stripe ids (TP-7) instead of inventing acct_test_*.
 */
export type PaymentAccountsStore = {
  get(participantId: string): Promise<AccountRecord | undefined>;
  put(row: AccountRecord): Promise<void>;
  reset?(): void;
};

export class InMemoryPaymentAccountsStore implements PaymentAccountsStore {
  private readonly rows = new Map<string, AccountRecord>();

  reset(): void {
    this.rows.clear();
  }

  async get(participantId: string): Promise<AccountRecord | undefined> {
    const row = this.rows.get(participantId);
    return row ? { ...row } : undefined;
  }

  async put(row: AccountRecord): Promise<void> {
    this.rows.set(row.participantId, { ...row });
  }
}

export class PostgresPaymentAccountsStore implements PaymentAccountsStore {
  private ready: Promise<void> | null = null;

  constructor(private readonly pool: Pool) {}

  private async ensureSchema(): Promise<void> {
    if (!this.ready) {
      this.ready = this.pool
        .query(
          `CREATE TABLE IF NOT EXISTS payment_accounts (
             participant_id     TEXT PRIMARY KEY,
             stripe_account_id  TEXT,
             payment_method_id  TEXT,
             kyc_status         TEXT NOT NULL DEFAULT 'none',
             role               TEXT NOT NULL,
             community_id       TEXT NOT NULL,
             updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
           )`,
        )
        .then(() => undefined);
    }
    await this.ready;
  }

  async get(participantId: string): Promise<AccountRecord | undefined> {
    await this.ensureSchema();
    const res = await this.pool.query<{
      participant_id: string;
      stripe_account_id: string | null;
      payment_method_id: string | null;
      kyc_status: string;
      role: string;
      community_id: string;
    }>("SELECT * FROM payment_accounts WHERE participant_id = $1", [
      participantId,
    ]);
    const row = res.rows[0];
    if (!row) return undefined;
    return {
      participantId: row.participant_id,
      stripeAccountId: row.stripe_account_id,
      paymentMethodId: row.payment_method_id,
      kycStatus: row.kyc_status,
      role: row.role as AccountRecord["role"],
      communityId: row.community_id,
    };
  }

  async put(row: AccountRecord): Promise<void> {
    await this.ensureSchema();
    await this.pool.query(
      `INSERT INTO payment_accounts (
         participant_id, stripe_account_id, payment_method_id,
         kyc_status, role, community_id, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (participant_id) DO UPDATE SET
         stripe_account_id = EXCLUDED.stripe_account_id,
         payment_method_id = EXCLUDED.payment_method_id,
         kyc_status = EXCLUDED.kyc_status,
         role = EXCLUDED.role,
         community_id = EXCLUDED.community_id,
         updated_at = now()`,
      [
        row.participantId,
        row.stripeAccountId,
        row.paymentMethodId,
        row.kycStatus,
        row.role,
        row.communityId,
      ],
    );
  }
}

export function createPaymentAccountsStore(
  env: NodeJS.ProcessEnv = process.env,
): PaymentAccountsStore {
  const url = env.DATABASE_URL;
  if (url) {
    return new PostgresPaymentAccountsStore(
      new pg.Pool({ connectionString: url }),
    );
  }
  return new InMemoryPaymentAccountsStore();
}
