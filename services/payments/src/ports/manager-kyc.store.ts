/**
 * REQ-051 / A5 — community-manager Stripe Identity records (no Connect).
 */
import pg, { type Pool } from "pg";
import type { KycStatus } from "../domain/store.js";

export const MANAGER_KYC_STORE = Symbol("MANAGER_KYC_STORE");

export type ManagerKycRecord = {
  subjectId: string;
  communityId: string;
  verificationId: string | null;
  kycStatus: KycStatus;
  kycVerified: boolean;
  updatedAt: string;
};

export type ManagerKycStore = {
  get(subjectId: string): Promise<ManagerKycRecord | undefined>;
  getByVerificationId(
    verificationId: string,
  ): Promise<ManagerKycRecord | undefined>;
  put(row: ManagerKycRecord): Promise<void>;
  reset?(): void;
};

export class InMemoryManagerKycStore implements ManagerKycStore {
  private readonly rows = new Map<string, ManagerKycRecord>();

  reset(): void {
    this.rows.clear();
  }

  async get(subjectId: string): Promise<ManagerKycRecord | undefined> {
    const row = this.rows.get(subjectId);
    return row ? { ...row } : undefined;
  }

  async getByVerificationId(
    verificationId: string,
  ): Promise<ManagerKycRecord | undefined> {
    for (const row of this.rows.values()) {
      if (row.verificationId === verificationId) return { ...row };
    }
    return undefined;
  }

  async put(row: ManagerKycRecord): Promise<void> {
    this.rows.set(row.subjectId, { ...row });
  }
}

type ManagerKycRow = {
  subject_id: string;
  community_id: string;
  verification_id: string | null;
  kyc_status: string;
  kyc_verified: boolean;
  updated_at: Date | string;
};

function toRecord(row: ManagerKycRow): ManagerKycRecord {
  const updatedAt =
    row.updated_at instanceof Date
      ? row.updated_at.toISOString()
      : String(row.updated_at);
  return {
    subjectId: row.subject_id,
    communityId: row.community_id,
    verificationId: row.verification_id,
    kycStatus: row.kyc_status as KycStatus,
    kycVerified: Boolean(row.kyc_verified),
    updatedAt,
  };
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS manager_kyc (
  subject_id       TEXT PRIMARY KEY,
  community_id     TEXT NOT NULL,
  verification_id  TEXT,
  kyc_status       TEXT NOT NULL DEFAULT 'none',
  kyc_verified     BOOLEAN NOT NULL DEFAULT false,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

export class PostgresManagerKycStore implements ManagerKycStore {
  private ready: Promise<void> | null = null;

  constructor(private readonly pool: Pool) {}

  private async ensureSchema(): Promise<void> {
    this.ready ??= this.pool.query(SCHEMA_SQL).then(() => undefined);
    await this.ready;
  }

  async get(subjectId: string): Promise<ManagerKycRecord | undefined> {
    await this.ensureSchema();
    const res = await this.pool.query<ManagerKycRow>(
      "SELECT * FROM manager_kyc WHERE subject_id = $1",
      [subjectId],
    );
    const row = res.rows[0];
    return row ? toRecord(row) : undefined;
  }

  async getByVerificationId(
    verificationId: string,
  ): Promise<ManagerKycRecord | undefined> {
    await this.ensureSchema();
    const res = await this.pool.query<ManagerKycRow>(
      "SELECT * FROM manager_kyc WHERE verification_id = $1 LIMIT 1",
      [verificationId],
    );
    const row = res.rows[0];
    return row ? toRecord(row) : undefined;
  }

  async put(row: ManagerKycRecord): Promise<void> {
    await this.ensureSchema();
    await this.pool.query(
      `INSERT INTO manager_kyc (
         subject_id, community_id, verification_id, kyc_status, kyc_verified, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (subject_id) DO UPDATE SET
         community_id = EXCLUDED.community_id,
         verification_id = EXCLUDED.verification_id,
         kyc_status = EXCLUDED.kyc_status,
         kyc_verified = EXCLUDED.kyc_verified,
         updated_at = EXCLUDED.updated_at`,
      [
        row.subjectId,
        row.communityId,
        row.verificationId,
        row.kycStatus,
        row.kycVerified,
        row.updatedAt,
      ],
    );
  }
}

export function createManagerKycStore(
  env: NodeJS.ProcessEnv = process.env,
): ManagerKycStore {
  const url = env.DATABASE_URL;
  if (url) {
    return new PostgresManagerKycStore(new pg.Pool({ connectionString: url }));
  }
  return new InMemoryManagerKycStore();
}
