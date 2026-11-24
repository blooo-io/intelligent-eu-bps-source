/**
 * REQ-051 — KYC audit log in the billing DB (identifiers / status only, NFR-015).
 */
import { describe, expect, it, vi } from "vitest";
import {
  createKycLogStore,
  InMemoryKycLogStore,
  KYC_LOG_ENTRY_KEYS,
  PostgresKycLogStore,
  type KycLogEntry,
} from "./kyc-log.store.js";

describe("KycLogStore (REQ-051)", () => {
  it("REQ-051: appends KYC log entries without personal data and lists them in order", async () => {
    const store = new InMemoryKycLogStore();
    const base = {
      subjectId: "p-1",
      subjectType: "participant" as const,
      source: "webhook" as const,
      pspEventId: null as string | null,
      errorCode: null as string | null,
    };
    const pending: KycLogEntry = {
      ...base,
      logId: "log-1",
      at: "2026-11-25T09:00:00.000Z",
      kycStatus: "pending",
      requirementsDueCount: 3,
    };
    const verified: KycLogEntry = {
      ...base,
      logId: "log-2",
      at: "2026-11-25T10:00:00.000Z",
      kycStatus: "verified",
      requirementsDueCount: 0,
    };
    await store.append(pending);
    await store.append(verified);

    const rows = await store.list("p-1");
    expect(rows).toHaveLength(2);
    expect(rows[1]?.kycStatus).toBe("verified");
    expect(Object.keys(rows[0]!).sort()).toEqual([...KYC_LOG_ENTRY_KEYS].sort());
    expect(Object.keys(rows[0]!)).not.toContain("name");
    expect(Object.keys(rows[0]!)).not.toContain("email");
    expect(Object.keys(rows[0]!)).not.toContain("document");
  });

  it("creates in-memory without DATABASE_URL and Postgres when set", () => {
    expect(createKycLogStore({})).toBeInstanceOf(InMemoryKycLogStore);
    expect(
      createKycLogStore({ DATABASE_URL: "postgresql://payments:x@localhost/payments" }),
    ).toBeInstanceOf(PostgresKycLogStore);
  });

  it("Postgres append and list round-trip", async () => {
    const inserted: unknown[] = [];
    const query = vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes("CREATE TABLE") || sql.includes("ALTER TABLE")) {
        return { rows: [] };
      }
      if (sql.includes("INSERT INTO kyc_log")) {
        inserted.push(params);
        return { rows: [] };
      }
      if (sql.includes("SELECT") && sql.includes("kyc_log")) {
        return {
          rows: [
            {
              log_id: "log-1",
              subject_id: "p-1",
              subject_type: "participant",
              at: new Date("2026-11-25T09:00:00.000Z"),
              source: "webhook",
              psp_event_id: null,
              kyc_status: "pending",
              requirements_due_count: 3,
              error_code: null,
            },
          ],
        };
      }
      return { rows: [] };
    });
    const store = new PostgresKycLogStore({ query } as never);
    await store.append({
      logId: "log-1",
      subjectId: "p-1",
      subjectType: "participant",
      at: "2026-11-25T09:00:00.000Z",
      source: "webhook",
      pspEventId: null,
      kycStatus: "pending",
      requirementsDueCount: 3,
      errorCode: null,
    });
    const rows = await store.list("p-1");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kycStatus).toBe("pending");
    expect(inserted).toHaveLength(1);
  });
});
