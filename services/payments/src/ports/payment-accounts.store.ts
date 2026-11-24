import pg, { type Pool } from "pg";
import type { AccountRecord } from "../domain/store.js";

export const PAYMENT_ACCOUNTS_STORE = Symbol("PAYMENT_ACCOUNTS_STORE");

/**
 * INT-228 — durable participant → PSP Connect / PM binding so restarts
 * keep consuming real PSP ids (TP-7) instead of inventing acct_test_*.
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

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS payment_accounts (
  participant_id        TEXT PRIMARY KEY,
  psp_account_ref       TEXT,
  psp_payment_method_ref TEXT,
  kyc_status            TEXT NOT NULL DEFAULT 'none',
  role                  TEXT NOT NULL,
  community_id          TEXT NOT NULL,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_accounts' AND column_name = 'stripe_account_id'
  ) THEN
    ALTER TABLE payment_accounts RENAME COLUMN stripe_account_id TO psp_account_ref;
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_accounts' AND column_name = 'payment_method_id'
  ) THEN
    ALTER TABLE payment_accounts RENAME COLUMN payment_method_id TO psp_payment_method_ref;
  END IF;
END $$;
`;

export class PostgresPaymentAccountsStore implements PaymentAccountsStore {
  private ready: Promise<void> | null = null;

  constructor(private readonly pool: Pool) {}

  private async ensureSchema(): Promise<void> {
    this.ready ??= this.pool.query(SCHEMA_SQL).then(() => undefined);
    await this.ready;
  }

  async get(participantId: string): Promise<AccountRecord | undefined> {
    await this.ensureSchema();
    const res = await this.pool.query<{
      participant_id: string;
      psp_account_ref: string | null;
      psp_payment_method_ref: string | null;
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
      pspAccountRef: row.psp_account_ref,
      pspPaymentMethodRef: row.psp_payment_method_ref,
      kycStatus: row.kyc_status,
      role: row.role as AccountRecord["role"],
      communityId: row.community_id,
    };
  }

  async put(row: AccountRecord): Promise<void> {
    await this.ensureSchema();
    await this.pool.query(
      `INSERT INTO payment_accounts (
         participant_id, psp_account_ref, psp_payment_method_ref,
         kyc_status, role, community_id, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (participant_id) DO UPDATE SET
         psp_account_ref = EXCLUDED.psp_account_ref,
         psp_payment_method_ref = EXCLUDED.psp_payment_method_ref,
         kyc_status = EXCLUDED.kyc_status,
         role = EXCLUDED.role,
         community_id = EXCLUDED.community_id,
         updated_at = now()`,
      [
        row.participantId,
        row.pspAccountRef,
        row.pspPaymentMethodRef,
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
