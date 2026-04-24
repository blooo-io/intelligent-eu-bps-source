import pg, { type Pool } from "pg";

/**
 * INT-225 — durable "already billed" set for FixtureTradeSource so a
 * settlement pod restart does not re-invoice the same fixture trades.
 */
export type BilledTradesStore = {
  load(): Promise<Set<string>>;
  mark(tradeIds: string[]): Promise<void>;
};

export class InMemoryBilledTradesStore implements BilledTradesStore {
  private readonly billed = new Set<string>();

  async load(): Promise<Set<string>> {
    return new Set(this.billed);
  }

  async mark(tradeIds: string[]): Promise<void> {
    for (const id of tradeIds) this.billed.add(id);
  }
}

export class PostgresBilledTradesStore implements BilledTradesStore {
  private ready: Promise<void> | null = null;

  constructor(private readonly pool: Pool) {}

  private async ensureSchema(): Promise<void> {
    if (!this.ready) {
      this.ready = this.pool
        .query(
          `CREATE TABLE IF NOT EXISTS fixture_billed_trades (
             trade_id   TEXT PRIMARY KEY,
             marked_at  TIMESTAMPTZ NOT NULL DEFAULT now()
           )`,
        )
        .then(() => undefined);
    }
    await this.ready;
  }

  async load(): Promise<Set<string>> {
    await this.ensureSchema();
    const res = await this.pool.query<{ trade_id: string }>(
      "SELECT trade_id FROM fixture_billed_trades",
    );
    return new Set(res.rows.map((r: { trade_id: string }) => r.trade_id));
  }

  async mark(tradeIds: string[]): Promise<void> {
    if (tradeIds.length === 0) return;
    await this.ensureSchema();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      for (const id of tradeIds) {
        await client.query(
          `INSERT INTO fixture_billed_trades (trade_id)
           VALUES ($1)
           ON CONFLICT (trade_id) DO NOTHING`,
          [id],
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
}

export function createBilledTradesStore(
  env: NodeJS.ProcessEnv = process.env,
): BilledTradesStore {
  const url = env.DATABASE_URL;
  if (url) {
    return new PostgresBilledTradesStore(new pg.Pool({ connectionString: url }));
  }
  return new InMemoryBilledTradesStore();
}
