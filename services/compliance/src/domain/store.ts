import type {
  AuditEvent,
  DataSubjectRequest,
  PersonalDataRecord,
  RetentionPolicy,
} from "./types.js";
import { DEFAULT_RETENTION_POLICY } from "./retention-config.js";

/** Default V1 retention (REQ-011 / REQ-013 / Task 3.23). */
export const DEFAULT_RETENTION: RetentionPolicy = {
  ...DEFAULT_RETENTION_POLICY,
};

export class ComplianceStore {
  private readonly requests = new Map<string, DataSubjectRequest>();
  private audits: AuditEvent[] = [];
  private readonly personal = new Map<string, PersonalDataRecord>();
  private retention: RetentionPolicy = { ...DEFAULT_RETENTION };

  constructor(initial?: RetentionPolicy) {
    if (initial) this.retention = { ...initial };
  }

  reset(): void {
    this.requests.clear();
    this.audits = [];
    this.personal.clear();
    this.retention = { ...DEFAULT_RETENTION };
  }

  setRetentionPolicy(policy: Partial<RetentionPolicy>): void {
    this.retention = { ...this.retention, ...policy };
  }

  getRetentionPolicy(): RetentionPolicy {
    return { ...this.retention };
  }

  putRequest(row: DataSubjectRequest): void {
    this.requests.set(row.requestId, structuredClone(row));
  }

  getRequest(requestId: string): DataSubjectRequest | undefined {
    const row = this.requests.get(requestId);
    return row ? structuredClone(row) : undefined;
  }

  /** Lookup by EWDS external request id (REQ-013 / Task 3.22 idempotency). */
  findByExternalRequestId(
    externalRequestId: string,
  ): DataSubjectRequest | undefined {
    for (const row of this.requests.values()) {
      if (row.externalRequestId === externalRequestId) {
        return structuredClone(row);
      }
    }
    return undefined;
  }

  listRequests(): DataSubjectRequest[] {
    return [...this.requests.values()].map((r) => structuredClone(r));
  }

  appendAudit(row: AuditEvent): void {
    this.audits.push(structuredClone(row));
  }

  listAudits(): AuditEvent[] {
    return this.audits.map((a) => structuredClone(a));
  }

  putPersonal(row: PersonalDataRecord): void {
    this.personal.set(row.participantId, structuredClone(row));
  }

  getPersonal(participantId: string): PersonalDataRecord | undefined {
    const row = this.personal.get(participantId);
    return row ? structuredClone(row) : undefined;
  }

  listPersonal(): PersonalDataRecord[] {
    return [...this.personal.values()].map((r) => structuredClone(r));
  }
}
