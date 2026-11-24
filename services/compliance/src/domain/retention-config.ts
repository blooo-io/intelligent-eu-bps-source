import type { RetentionPolicy } from "./types.js";

/** Default V1 retention (REQ-011 / REQ-013 / Task 3.23). */
export const DEFAULT_RETENTION_POLICY: RetentionPolicy = {
  personalRetentionDays: 365,
  invoiceRetentionYears: 10,
  kycLogRetentionYears: 5,
};

/**
 * Read retention periods from the environment (REQ-011).
 * - `RETENTION_PERSONAL_DAYS` (default 365)
 * - `RETENTION_INVOICE_YEARS` (default 10; must be 6..10)
 * - `RETENTION_KYC_LOG_YEARS` (default 5; must be ≥ 5)
 */
export function readRetentionPolicy(
  env: NodeJS.ProcessEnv = process.env,
): RetentionPolicy {
  const personalRetentionDays = readInt(
    env.RETENTION_PERSONAL_DAYS,
    DEFAULT_RETENTION_POLICY.personalRetentionDays,
    "personalRetentionDays",
  );
  const invoiceRetentionYears = readInt(
    env.RETENTION_INVOICE_YEARS,
    DEFAULT_RETENTION_POLICY.invoiceRetentionYears,
    "invoiceRetentionYears",
  );
  const kycLogRetentionYears = readInt(
    env.RETENTION_KYC_LOG_YEARS,
    DEFAULT_RETENTION_POLICY.kycLogRetentionYears,
    "kycLogRetentionYears",
  );

  if (personalRetentionDays < 1) {
    throw new Error("personalRetentionDays must be at least 1");
  }
  if (invoiceRetentionYears < 6 || invoiceRetentionYears > 10) {
    throw new Error("invoiceRetentionYears must be between 6 and 10");
  }
  if (kycLogRetentionYears < 5) {
    throw new Error("kycLogRetentionYears must be at least 5");
  }

  return {
    personalRetentionDays,
    invoiceRetentionYears,
    kycLogRetentionYears,
  };
}

function readInt(
  raw: string | undefined,
  fallback: number,
  label: string,
): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) {
    throw new Error(`${label} must be an integer`);
  }
  return n;
}
