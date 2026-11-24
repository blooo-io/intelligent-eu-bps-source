import pg, { type Pool } from "pg";

export const CONNECTED_CUSTOMERS_STORE = Symbol("CONNECTED_CUSTOMERS_STORE");

/**
 * INT-355 / REQ-014 — consumer → Customer on a producer Connect account.
 * One row per (participant, connected account); the PSP stays master (TP-7),
 * this is only the link needed to reuse the Customer.
 */
export type ConnectedCustomerRecord = {
  participantId: string;
  pspAccountRef: string;
  pspCustomerRef: string;
};

export type ConnectedCustomersStore = {
  get(
    participantId: string,
    pspAccountRef: string,
  ): Promise<ConnectedCustomerRecord | undefined>;
  putIfAbsent(row: ConnectedCustomerRecord): Promise<ConnectedCustomerRecord>;
  reset?(): void;
};

function key(participantId: string, pspAccountRef: string): string {
  return `${participantId}|${pspAccountRef}`;
}

export class InMemoryConnectedCustomersStore implements ConnectedCustomersStore {
  private readonly rows = new Map<string, ConnectedCustomerRecord>();

  reset(): void {
    this.rows.clear();
  }

  async get(
    participantId: string,
    pspAccountRef: string,
  ): Promise<ConnectedCustomerRecord | undefined> {
    const row = this.rows.get(key(participantId, pspAccountRef));
    return row ? { ...row } : undefined;
  }

  async putIfAbsent(row: ConnectedCustomerRecord): Promise<ConnectedCustomerRecord> {
    const k = key(row.participantId, row.pspAccountRef);
    const existing = this.rows.get(k);
    if (existing) return { ...existing };
    this.rows.set(k, { ...row });
    return { ...row };
  }
}

type Row = {
  participant_id: string;
  psp_account_ref: string;
  psp_customer_ref: string;
};

function fromRow(row: Row): ConnectedCustomerRecord {
  return {
    participantId: row.participant_id,
    pspAccountRef: row.psp_account_ref,
    pspCustomerRef: row.psp_customer_ref,
  };
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS connected_customers (
  participant_id    TEXT NOT NULL,
  psp_account_ref   TEXT NOT NULL,
  psp_customer_ref  TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (participant_id, psp_account_ref)
);
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'connected_customers' AND column_name = 'stripe_account_id'
  ) THEN
    ALTER TABLE connected_customers RENAME COLUMN stripe_account_id TO psp_account_ref;
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'connected_customers' AND column_name = 'stripe_customer_id'
  ) THEN
    ALTER TABLE connected_customers RENAME COLUMN stripe_customer_id TO psp_customer_ref;
  END IF;
END $$;
`;

export class PostgresConnectedCustomersStore implements ConnectedCustomersStore {
  private ready: Promise<void> | null = null;

  constructor(private readonly pool: Pool) {}

  private async ensureSchema(): Promise<void> {
    this.ready ??= this.pool.query(SCHEMA_SQL).then(() => undefined);
    await this.ready;
  }

  async get(
    participantId: string,
    pspAccountRef: string,
  ): Promise<ConnectedCustomerRecord | undefined> {
    await this.ensureSchema();
    const res = await this.pool.query<Row>(
      `SELECT participant_id, psp_account_ref, psp_customer_ref
         FROM connected_customers
        WHERE participant_id = $1 AND psp_account_ref = $2`,
      [participantId, pspAccountRef],
    );
    const row = res.rows[0];
    return row ? fromRow(row) : undefined;
  }

  async putIfAbsent(row: ConnectedCustomerRecord): Promise<ConnectedCustomerRecord> {
    await this.ensureSchema();
    await this.pool.query(
      `INSERT INTO connected_customers (participant_id, psp_account_ref, psp_customer_ref)
       VALUES ($1, $2, $3)
       ON CONFLICT (participant_id, psp_account_ref) DO NOTHING`,
      [row.participantId, row.pspAccountRef, row.pspCustomerRef],
    );
    return (await this.get(row.participantId, row.pspAccountRef)) ?? { ...row };
  }
}

export function createConnectedCustomersStore(
  env: NodeJS.ProcessEnv = process.env,
): ConnectedCustomersStore {
  const url = env.DATABASE_URL;
  if (url) {
    return new PostgresConnectedCustomersStore(
      new pg.Pool({ connectionString: url, max: 2 }),
    );
  }
  return new InMemoryConnectedCustomersStore();
}
