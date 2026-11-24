/**
 * REQ-051 — KYC audit log in the billing DB.
 * Entries hold identifiers and status only (NFR-015 / no personal data).
 */
import pg, { type Pool } from "pg";
import type { KycStatus } from "../domain/store.js";

export const KYC_LOG_STORE = Symbol("KYC_LOG_STORE");

/** Exact keys of a KYC log row — tests assert no PII fields sneak in. */
export const KYC_LOG_ENTRY_KEYS = [
  "logId",
  "subjectId",
  "subjectType",
  "at",
  "source",
  "pspEventId",
  "kycStatus",
  "requirementsDueCount",
  "errorCode",
] as const;

export type KycLogEntry = {
  logId: string;
  subjectId: string;
  subjectType: "participant" | "manager";
  at: string;
  source: "webhook" | "poll" | "operator";
  pspEventId: string | null;
  kycStatus: KycStatus;
  requirementsDueCount: number;
  errorCode: string | null;
};

export type KycLogStore = {
  append(e: KycLogEntry): Promise<void>;
  list(subjectId: string): Promise<KycLogEntry[]>;
  reset?(): void;
};

export class InMemoryKycLogStore implements KycLogStore {
  private readonly rows: KycLogEntry[] = [];

  reset(): void {
    this.rows.length = 0;
  }

  async append(e: KycLogEntry): Promise<void> {
    this.rows.push({ ...e });
  }

  async list(subjectId: string): Promise<KycLogEntry[]> {
    return this.rows
      .filter((r) => r.subjectId === subjectId)
      .map((r) => ({ ...r }));
  }
}

type KycLogRow = {
  log_id: string;
  subject_id: string;
  subject_type: string;
  at: Date | string;
  source: string;
  psp_event_id: string | null;
  kyc_status: string;
  requirements_due_count: number;
  error_code: string | null;
};

function toEntry(row: KycLogRow): KycLogEntry {
  const at =
    row.at instanceof Date ? row.at.toISOString() : String(row.at);
  return {
    logId: row.log_id,
    subjectId: row.subject_id,
    subjectType: row.subject_type as KycLogEntry["subjectType"],
    at,
    source: row.source as KycLogEntry["source"],
    pspEventId: row.psp_event_id,
    kycStatus: row.kyc_status as KycStatus,
    requirementsDueCount: Number(row.requirements_due_count),
    errorCode: row.error_code,
  };
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS kyc_log (
  log_id                   TEXT PRIMARY KEY,
  subject_id               TEXT NOT NULL,
  subject_type             TEXT NOT NULL,
  at                       TIMESTAMPTZ NOT NULL,
  source                   TEXT NOT NULL,
  psp_event_id             TEXT,
  kyc_status               TEXT NOT NULL,
  requirements_due_count   INTEGER NOT NULL DEFAULT 0,
  error_code               TEXT
);
CREATE INDEX IF NOT EXISTS kyc_log_subject_at_idx ON kyc_log (subject_id, at);
`;

export class PostgresKycLogStore implements KycLogStore {
  private ready: Promise<void> | null = null;

  constructor(private readonly pool: Pool) {}

  private async ensureSchema(): Promise<void> {
    this.ready ??= this.pool.query(SCHEMA_SQL).then(() => undefined);
    await this.ready;
  }

  async append(e: KycLogEntry): Promise<void> {
    await this.ensureSchema();
    await this.pool.query(
      `INSERT INTO kyc_log (
         log_id, subject_id, subject_type, at, source,
         psp_event_id, kyc_status, requirements_due_count, error_code
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (log_id) DO NOTHING`,
      [
        e.logId,
        e.subjectId,
        e.subjectType,
        e.at,
        e.source,
        e.pspEventId,
        e.kycStatus,
        e.requirementsDueCount,
        e.errorCode,
      ],
    );
  }

  async list(subjectId: string): Promise<KycLogEntry[]> {
    await this.ensureSchema();
    const res = await this.pool.query<KycLogRow>(
      "SELECT * FROM kyc_log WHERE subject_id = $1 ORDER BY at ASC, log_id ASC",
      [subjectId],
    );
    return res.rows.map(toEntry);
  }
}

export function createKycLogStore(
  env: NodeJS.ProcessEnv = process.env,
): KycLogStore {
  const url = env.DATABASE_URL;
  if (url) {
    return new PostgresKycLogStore(new pg.Pool({ connectionString: url }));
  }
  return new InMemoryKycLogStore();
}
