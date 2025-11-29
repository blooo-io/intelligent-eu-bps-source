import type {
  AuditEvent,
  DataSubjectRequest,
  PersonalDataRecord,
  RetentionPolicy,
} from "./types.js";

/** Default V1 personal retention: 365 days after relationship end (REQ-011). */
export const DEFAULT_RETENTION: RetentionPolicy = {
  personalRetentionDays: 365,
};

export class ComplianceStore {
  private requests = new Map<string, DataSubjectRequest>();
  private audits: AuditEvent[] = [];
  private personal = new Map<string, PersonalDataRecord>();
  private retention: RetentionPolicy = { ...DEFAULT_RETENTION };

  reset(): void {
    this.requests.clear();
    this.audits = [];
    this.personal.clear();
    this.retention = { ...DEFAULT_RETENTION };
  }

  setRetentionPolicy(policy: RetentionPolicy): void {
    this.retention = { ...policy };
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
