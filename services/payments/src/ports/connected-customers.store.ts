import pg, { type Pool } from "pg";

export const CONNECTED_CUSTOMERS_STORE = Symbol("CONNECTED_CUSTOMERS_STORE");

/**
 * INT-355 / REQ-014 — consumer → Customer on a producer Connect account.
 * One row per (participant, connected account); Stripe stays master (TP-7),
 * this is only the link needed to reuse the Customer.
 */
export type ConnectedCustomerRecord = {
  participantId: string;
  stripeAccountId: string;
  stripeCustomerId: string;
};

export type ConnectedCustomersStore = {
  get(
    participantId: string,
    stripeAccountId: string,
  ): Promise<ConnectedCustomerRecord | undefined>;
  /** Keeps the first stored Customer when two requests race; returns the stored row. */
  putIfAbsent(row: ConnectedCustomerRecord): Promise<ConnectedCustomerRecord>;
  reset?(): void;
};

function key(participantId: string, stripeAccountId: string): string {
  return `${participantId}|${stripeAccountId}`;
}

export class InMemoryConnectedCustomersStore implements ConnectedCustomersStore {
  private readonly rows = new Map<string, ConnectedCustomerRecord>();

  reset(): void {
    this.rows.clear();
  }

  async get(
    participantId: string,
    stripeAccountId: string,
  ): Promise<ConnectedCustomerRecord | undefined> {
    const row = this.rows.get(key(participantId, stripeAccountId));
    return row ? { ...row } : undefined;
  }

  async putIfAbsent(row: ConnectedCustomerRecord): Promise<ConnectedCustomerRecord> {
    const k = key(row.participantId, row.stripeAccountId);
    const existing = this.rows.get(k);
    if (existing) {
      return { ...existing };
    }
    this.rows.set(k, { ...row });
    return { ...row };
  }
}

type Row = {
  participant_id: string;
  stripe_account_id: string;
  stripe_customer_id: string;
};

function fromRow(row: Row): ConnectedCustomerRecord {
  return {
    participantId: row.participant_id,
    stripeAccountId: row.stripe_account_id,
    stripeCustomerId: row.stripe_customer_id,
  };
}

export class PostgresConnectedCustomersStore implements ConnectedCustomersStore {
  private ready: Promise<void> | null = null;

  constructor(private readonly pool: Pool) {}

  private async ensureSchema(): Promise<void> {
    this.ready ??= this.pool
      .query(
        `CREATE TABLE IF NOT EXISTS connected_customers (
           participant_id     TEXT NOT NULL,
           stripe_account_id  TEXT NOT NULL,
           stripe_customer_id TEXT NOT NULL,
           created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
           PRIMARY KEY (participant_id, stripe_account_id)
         )`,
      )
      .then(() => undefined);
    await this.ready;
  }

  async get(
    participantId: string,
    stripeAccountId: string,
  ): Promise<ConnectedCustomerRecord | undefined> {
    await this.ensureSchema();
    const res = await this.pool.query<Row>(
      `SELECT participant_id, stripe_account_id, stripe_customer_id
         FROM connected_customers
        WHERE participant_id = $1 AND stripe_account_id = $2`,
      [participantId, stripeAccountId],
    );
    const row = res.rows[0];
    return row ? fromRow(row) : undefined;
  }

  async putIfAbsent(row: ConnectedCustomerRecord): Promise<ConnectedCustomerRecord> {
    await this.ensureSchema();
    await this.pool.query(
      `INSERT INTO connected_customers (participant_id, stripe_account_id, stripe_customer_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (participant_id, stripe_account_id) DO NOTHING`,
      [row.participantId, row.stripeAccountId, row.stripeCustomerId],
    );
    return (await this.get(row.participantId, row.stripeAccountId)) ?? { ...row };
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
