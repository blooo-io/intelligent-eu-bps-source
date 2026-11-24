import {
  BadRequestException,
  ForbiddenException,
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  IdempotentConsumer,
  OutboxService,
} from "@intelligent/module-template";
import { ComplianceStore } from "../domain/store.js";
import type {
  AuditEvent,
  DataSubjectConfirmation,
  DataSubjectExport,
  DataSubjectRequest,
  DataSubjectRequestType,
  ErasureModule,
  PersonalDataRecord,
} from "../domain/types.js";
import { ERASURE_MODULES } from "../domain/types.js";
import { IDP_PORT, type IdpPort } from "../idp/idp.port.js";
import type { MockIdpAdapter } from "../idp/mock-idp.adapter.js";
import {
  PSP_ERASE_PORT,
  type PspErasePort,
} from "../psp/psp-erase.port.js";
import type { MockPspEraseAdapter } from "../psp/mock-psp-erase.adapter.js";
import {
  PARTICIPANT_COMMUNITY,
  type ParticipantCommunityPort,
} from "../ports/participant-community.port.js";
import {
  PERSONAL_DATA_SOURCES,
  type PersonalDataSources,
} from "../export/personal-data-sources.port.js";
import {
  ERASURE_REQUEST_PORT,
  type ErasureRequestPort,
  type InboundErasureRequest,
} from "../erasure/erasure-request.port.js";

const PRODUCER = "AC-12";

/** Export download window after the request is opened (REQ-013). */
const EXPORT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * AC-12 compliance — audit, retention, DSR orchestration (INT-111).
 * REQ-011 retention, REQ-013 export/erasure, REQ-030 audit (identifiers only).
 */
@Injectable()
export class ComplianceService {
  constructor(
    @Inject(ComplianceStore) private readonly store: ComplianceStore,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(IdempotentConsumer) private readonly consumer: IdempotentConsumer,
    @Inject(IDP_PORT) private readonly idp: IdpPort,
    @Inject(PSP_ERASE_PORT) private readonly psp: PspErasePort,
    @Inject(PARTICIPANT_COMMUNITY)
    private readonly directory: ParticipantCommunityPort,
    @Inject(PERSONAL_DATA_SOURCES)
    private readonly personalData: PersonalDataSources,
    @Inject(ERASURE_REQUEST_PORT)
    private readonly erasureRequests: ErasureRequestPort,
  ) {}

  resetStore(): void {
    this.store.reset();
    const idp = this.idp as MockIdpAdapter;
    if (typeof idp.reset === "function") idp.reset();
    const psp = this.psp as MockPspEraseAdapter;
    if (typeof psp.reset === "function") psp.reset();
  }

  /** Seed personal-data projection for retention / erasure tests (UAT-011). */
  seedPersonal(row: PersonalDataRecord): void {
    this.store.putPersonal(row);
  }

  setRetentionDays(days: number): void {
    this.store.setRetentionPolicy({ personalRetentionDays: days });
  }

  setInvoiceRetentionYears(years: number): void {
    this.store.setRetentionPolicy({ invoiceRetentionYears: years });
  }

  /** Current retention policy (REQ-011 / Task 3.23). */
  getRetentionPolicy() {
    return this.store.getRetentionPolicy();
  }

  listRequests() {
    return this.store.listRequests();
  }

  /**
   * REQ-013 Art. 15/20 — assemble the machine-readable export on read.
   * Personal data is never written to the compliance store.
   */
  async buildExport(requestId: string): Promise<DataSubjectExport> {
    const row = this.store.getRequest(requestId);
    if (!row) throw new NotFoundException(`Unknown request ${requestId}`);
    this.assertExportAvailable(row);

    const policy = this.store.getRetentionPolicy();
    const [participant, paymentAccount, invoices] = await Promise.all([
      this.personalData.getParticipantPersonalData(row.participantId),
      this.personalData.getPaymentAccountPersonalData(row.participantId),
      this.personalData.listInvoices(row.participantId),
    ]);

    const dataSubjectRequests = this.store
      .listRequests()
      .filter((r) => r.participantId === row.participantId)
      .map((r) => ({
        requestId: r.requestId,
        type: r.type,
        status: r.status,
        createdAt: r.createdAt,
      }));

    return {
      schemaVersion: "1.0",
      requestId: row.requestId,
      producedAt: new Date().toISOString(),
      controller: { communityId: row.communityId },
      participant,
      paymentAccount,
      invoices: invoices.map((inv) => ({
        ...inv,
        retainedUntil: retainedUntil(
          inv.issuedAt,
          inv.period,
          policy.invoiceRetentionYears,
        ),
      })),
      dataSubjectRequests,
      retention: { invoiceRetentionYears: policy.invoiceRetentionYears },
    };
  }

  /**
   * Public export download (REQ-013 / REQ-049). Same community scoping as
   * {@link getRequestForCaller}; a peer in the same community gets 403.
   */
  async getExportForCaller(
    requestId: string,
    caller: {
      sub: string;
      communityId: string;
      roles: string[];
      selfParticipantId?: string;
    },
  ): Promise<DataSubjectExport> {
    const row = this.store.getRequest(requestId);
    if (!row || !caller.communityId || row.communityId !== caller.communityId) {
      throw new NotFoundException(`Unknown request ${requestId}`);
    }
    if (!this.callerMayRead(row, caller)) {
      throw new ForbiddenException("Not allowed to download this export");
    }
    return this.buildExport(requestId);
  }

  private assertExportAvailable(row: DataSubjectRequest): void {
    if (row.type === "erasure") {
      throw new GoneException("Export is not available for an erasure request");
    }
    const ageMs = Date.now() - Date.parse(row.createdAt);
    if (!Number.isNaN(ageMs) && ageMs > EXPORT_TTL_MS) {
      throw new GoneException("Export is older than 30 days");
    }
  }

  listAudits(): AuditEvent[] {
    return this.store.listAudits();
  }

  listPersonal(): PersonalDataRecord[] {
    return this.store.listPersonal();
  }

  idpRecorded() {
    return this.idp.recorded();
  }

  pspRecorded() {
    return this.psp.recorded();
  }

  getRequest(requestId: string): {
    requestId: string;
    participantId: string;
    type: DataSubjectRequestType;
    status: string;
  } {
    const row = this.store.getRequest(requestId);
    if (!row) throw new NotFoundException(`Unknown request ${requestId}`);
    return {
      requestId: row.requestId,
      participantId: row.participantId,
      type: row.type,
      status: row.status,
    };
  }

  /**
   * Public read (REQ-013 / REQ-049). A member sees a request they opened or
   * that names them, in their community. A manager, operator or DPO sees a
   * request in their community. Anything else is hidden.
   */
  getRequestForCaller(
    requestId: string,
    caller: {
      sub: string;
      communityId: string;
      roles: string[];
      /** Registry participant of a member, resolved from the IdP sub (INT-375). */
      selfParticipantId?: string;
    },
  ): {
    requestId: string;
    participantId: string;
    type: DataSubjectRequestType;
    status: string;
  } {
    const row = this.store.getRequest(requestId);
    if (!row || !this.callerMayRead(row, caller)) {
      throw new NotFoundException(`Unknown request ${requestId}`);
    }
    return {
      requestId: row.requestId,
      participantId: row.participantId,
      type: row.type,
      status: row.status,
    };
  }

  /**
   * Manager or DPO naming another participant (REQ-013). The target must
   * belong to the caller community. AC-03 is authoritative; the local
   * personal-data projection is the fallback when the directory is unset.
   */
  async assertParticipantInCommunity(
    participantId: string,
    communityId: string,
  ): Promise<void> {
    if (!communityId) {
      throw new ForbiddenException("Missing community scope");
    }
    const fromDirectory = await this.directory.communityOf(participantId);
    const personal = this.store.getPersonal(participantId)?.communityId;
    const target = fromDirectory ?? personal;
    if (!target || target !== communityId) {
      throw new NotFoundException(`Unknown participant ${participantId}`);
    }
  }

  private callerMayRead(
    row: DataSubjectRequest,
    caller: {
      sub: string;
      communityId: string;
      roles: string[];
      selfParticipantId?: string;
    },
  ): boolean {
    if (!caller.communityId || row.communityId !== caller.communityId) {
      return false;
    }
    const elevated = ["manager", "dpo", "operator"].some((role) =>
      caller.roles.includes(role),
    );
    if (elevated) return true;
    const self = caller.selfParticipantId ?? caller.sub;
    return row.participantId === self || row.actorId === caller.sub;
  }

  getRequestDetail(requestId: string): DataSubjectRequest {
    const row = this.store.getRequest(requestId);
    if (!row) throw new NotFoundException(`Unknown request ${requestId}`);
    return row;
  }

  /**
   * Create export or erasure request (REQ-013 / UAT-013 / S12).
   * Member acts for self when participantId omitted; DPO may set it.
   */
  async createDataSubjectRequest(input: {
    type: DataSubjectRequestType;
    participantId: string;
    actorId: string;
    communityId: string;
  }): Promise<{
    requestId: string;
    participantId: string;
    type: DataSubjectRequestType;
    status: string;
  }> {
    if (input.type !== "export" && input.type !== "erasure") {
      throw new BadRequestException("type must be export or erasure");
    }
    if (!input.participantId) {
      throw new BadRequestException("participantId is required");
    }

    const now = new Date().toISOString();
    const requestId = randomUUID();
    let row: DataSubjectRequest = {
      requestId,
      participantId: input.participantId,
      communityId: input.communityId || "00000000-0000-4000-8000-000000000000",
      type: input.type,
      status: "accepted",
      createdAt: now,
      updatedAt: now,
      actorId: input.actorId,
      origin: "portal",
      erasureResults: {},
      identityErasureSent: false,
      paymentProviderErasureSent: false,
    };
    this.store.putRequest(row);

    await this.recordAudit({
      actorId: input.actorId,
      action: `data-subject-request.${input.type}.created`,
      target: `request:${requestId}|participant:${input.participantId}`,
      timestamp: now,
    });

    if (input.type === "export") {
      row = await this.completeExport(row);
    } else {
      row = await this.startErasure(row);
    }

    return {
      requestId: row.requestId,
      participantId: row.participantId,
      type: row.type,
      status: row.status,
    };
  }

  /**
   * REQ-013 / Task 3.22 — accept an erasure request originated by the EWDS.
   * Idempotent on `externalRequestId`. The subject (`actorId`) must belong to
   * `communityId`; otherwise the outcome is reported failed with no erasure.
   */
  async acceptExternalErasureRequest(
    r: InboundErasureRequest,
  ): Promise<{ requestId: string; duplicate: boolean }> {
    const existing = this.store.findByExternalRequestId(r.externalRequestId);
    if (existing) {
      return { requestId: existing.requestId, duplicate: true };
    }

    const fromDirectory = await this.directory.communityOf(r.actorId);
    const personal = this.store.getPersonal(r.actorId)?.communityId;
    const targetCommunity = fromDirectory ?? personal;
    if (!targetCommunity || targetCommunity !== r.communityId) {
      await this.erasureRequests.reportOutcome(r.externalRequestId, {
        status: "failed",
        requestId: "",
        invoicesRetainedUntil: null,
      });
      return { requestId: "", duplicate: false };
    }

    const now = r.receivedAt || new Date().toISOString();
    const requestId = randomUUID();
    let row: DataSubjectRequest = {
      requestId,
      participantId: r.actorId,
      communityId: r.communityId,
      type: "erasure",
      status: "accepted",
      createdAt: now,
      updatedAt: now,
      actorId: `ewds:${r.issuedBy}`,
      origin: "ewds",
      externalRequestId: r.externalRequestId,
      erasureResults: {},
      identityErasureSent: false,
      paymentProviderErasureSent: false,
    };
    this.store.putRequest(row);

    await this.recordAudit({
      actorId: row.actorId,
      action: "data-subject-request.erasure.created",
      target: `request:${requestId}|participant:${r.actorId}|external:${r.externalRequestId}`,
      timestamp: now,
    });

    row = await this.startErasure(row);
    if (row.status === "failed" && row.externalRequestId) {
      await this.erasureRequests.reportOutcome(row.externalRequestId, {
        status: "failed",
        requestId: row.requestId,
        invoicesRetainedUntil: null,
      });
    }
    return { requestId: row.requestId, duplicate: false };
  }

  /**
   * ApplyRetention — AC-14 daily job (REQ-011 / UAT-011).
   * Anonymizes personal cache past retention with no active relationship.
   * Invoice ids under legal retention stay listed on the anonymized row.
   */
  async applyRetention(nowIso = new Date().toISOString()): Promise<{
    accepted: true;
    anonymized: number;
  }> {
    const policy = this.store.getRetentionPolicy();
    const nowMs = Date.parse(nowIso);
    const cutoffMs = policy.personalRetentionDays * 24 * 60 * 60 * 1000;
    let anonymized = 0;

    for (const row of this.store.listPersonal()) {
      if (row.anonymized || row.activeRelationship) continue;
      const ended = Date.parse(row.relationshipEndedAt);
      if (Number.isNaN(ended) || nowMs - ended < cutoffMs) continue;

      this.store.putPersonal({
        ...row,
        anonymized: true,
      });
      anonymized += 1;
      await this.recordAudit({
        actorId: "00000000-0000-4000-8000-000000000001",
        action: "retention.anonymize",
        target: `participant:${row.participantId}`,
        timestamp: nowIso,
      });
    }

    return { accepted: true, anonymized };
  }

  /**
   * Consume ErasureCompleted from AC-03 / AC-06 / AC-07 (idempotent on eventId).
   */
  async onErasureCompleted(event: {
    eventId: string;
    requestId: string;
    module: ErasureModule;
    result: "completed" | "failed";
  }): Promise<{ status: string }> {
    const result = await this.consumer.handle(event.eventId, event, async (e) => {
      const row = this.store.getRequest(e.requestId);
      if (!row) {
        throw new BadRequestException(`Unknown request ${e.requestId}`);
      }
      if (row.type !== "erasure") {
        throw new BadRequestException(`Request ${e.requestId} is not erasure`);
      }
      if (!ERASURE_MODULES.includes(e.module)) {
        throw new BadRequestException(`Unexpected module ${e.module}`);
      }

      const next: DataSubjectRequest = {
        ...row,
        erasureResults: { ...row.erasureResults, [e.module]: e.result },
        updatedAt: new Date().toISOString(),
      };

      if (e.result === "failed") {
        next.status = "failed";
        this.store.putRequest(next);
        await this.recordAudit({
          actorId: e.module,
          action: "erasure.module.failed",
          target: `request:${e.requestId}|module:${e.module}`,
          timestamp: next.updatedAt,
        });
        if (next.origin === "ewds" && next.externalRequestId) {
          await this.erasureRequests.reportOutcome(next.externalRequestId, {
            status: "failed",
            requestId: next.requestId,
            invoicesRetainedUntil: null,
          });
        }
        return;
      }

      this.store.putRequest(next);
      await this.maybeCompleteErasure(next);
    });
    if (result.status === "failed") throw result.error;
    return { status: result.status };
  }

  /** Consume AuditableActionPerformed from other modules (REQ-030 / UAT-030). */
  async onAuditableActionPerformed(event: {
    eventId: string;
    actorId: string;
    action: string;
    target: string;
    timestamp: string;
  }): Promise<{ status: string }> {
    const result = await this.consumer.handle(event.eventId, event, async (e) => {
      this.store.appendAudit({
        auditId: randomUUID(),
        eventId: e.eventId,
        actorId: e.actorId,
        action: e.action,
        target: e.target,
        timestamp: e.timestamp,
      });
    });
    if (result.status === "failed") throw result.error;
    return { status: result.status };
  }

  private async startErasure(
    row: DataSubjectRequest,
  ): Promise<DataSubjectRequest> {
    // IdP then PSP — eraseIdentity before ErasureRequested (REQ-013 review focus).
    const idpResult = await this.idp.erase({
      requestId: row.requestId,
      participantId: row.participantId,
    });
    const pspResult = await this.psp.erase({
      requestId: row.requestId,
      participantId: row.participantId,
    });

    const identityErasureSent = idpResult.ok;
    const paymentProviderErasureSent = pspResult.ok;
    const externalOk = identityErasureSent && paymentProviderErasureSent;

    if (!externalOk) {
      const failed: DataSubjectRequest = {
        ...row,
        status: "failed",
        identityErasureSent,
        paymentProviderErasureSent,
        pspOutcome: pspResult.outcome,
        updatedAt: new Date().toISOString(),
      };
      this.store.putRequest(failed);
      await this.recordAudit({
        actorId: row.actorId,
        action: "erasure.external.failed",
        target: `request:${row.requestId}|participant:${row.participantId}`,
        timestamp: failed.updatedAt,
      });
      return failed;
    }

    await this.outbox.append({
      aggregateType: "DataSubjectRequest",
      aggregateId: row.requestId,
      type: "ErasureRequested",
      producer: PRODUCER,
      communityId: row.communityId,
      billingMode: "virtual",
      data: {
        requestId: row.requestId,
        participantId: row.participantId,
      },
    });

    // Anonymize local personal cache immediately; invoices stay listed (legal retention).
    const personal = this.store.getPersonal(row.participantId);
    if (personal) {
      this.store.putPersonal({ ...personal, anonymized: true });
    }

    const next: DataSubjectRequest = {
      ...row,
      status: "propagating",
      identityErasureSent,
      paymentProviderErasureSent,
      pspOutcome: pspResult.outcome,
      updatedAt: new Date().toISOString(),
    };
    this.store.putRequest(next);

    await this.recordAudit({
      actorId: row.actorId,
      action: "erasure.propagated",
      target: `request:${row.requestId}|participant:${row.participantId}`,
      timestamp: next.updatedAt,
    });

    return next;
  }

  private async completeExport(
    row: DataSubjectRequest,
  ): Promise<DataSubjectRequest> {
    const personal = this.store.getPersonal(row.participantId);
    const confirmation: DataSubjectConfirmation = {
      kind: "export",
      requestId: row.requestId,
      participantId: row.participantId,
      invoicesRetained: personal?.invoiceIds ?? [],
      producedAt: new Date().toISOString(),
    };
    const next: DataSubjectRequest = {
      ...row,
      status: "completed",
      confirmation,
      updatedAt: confirmation.producedAt,
    };
    this.store.putRequest(next);
    await this.recordAudit({
      actorId: row.actorId,
      action: "data-subject-request.export.completed",
      target: `request:${row.requestId}|participant:${row.participantId}`,
      timestamp: next.updatedAt,
    });
    return next;
  }

  private async maybeCompleteErasure(row: DataSubjectRequest): Promise<void> {
    const allDone = ERASURE_MODULES.every(
      (m) => row.erasureResults[m] === "completed",
    );
    if (!allDone) return;

    const personal = this.store.getPersonal(row.participantId);
    const invoicesRetained = personal?.invoiceIds ?? [];
    const confirmation: DataSubjectConfirmation = {
      kind: "erasure",
      requestId: row.requestId,
      participantId: row.participantId,
      invoicesRetained,
      producedAt: new Date().toISOString(),
    };
    const next: DataSubjectRequest = {
      ...row,
      status: "completed",
      confirmation,
      updatedAt: confirmation.producedAt,
    };
    this.store.putRequest(next);
    await this.recordAudit({
      actorId: row.actorId,
      action: "data-subject-request.erasure.completed",
      target: `request:${row.requestId}|participant:${row.participantId}`,
      timestamp: next.updatedAt,
    });

    if (row.origin === "ewds" && row.externalRequestId) {
      const policy = this.store.getRetentionPolicy();
      const invoicesRetainedUntil =
        invoicesRetained.length > 0
          ? retainedUntil(
              confirmation.producedAt,
              confirmation.producedAt.slice(0, 7),
              policy.invoiceRetentionYears,
            )
          : null;
      await this.erasureRequests.reportOutcome(row.externalRequestId, {
        status: "completed",
        requestId: row.requestId,
        invoicesRetainedUntil,
      });
    }
  }

  private async recordAudit(input: {
    actorId: string;
    action: string;
    target: string;
    timestamp: string;
    eventId?: string;
  }): Promise<void> {
    this.store.appendAudit({
      auditId: randomUUID(),
      eventId: input.eventId,
      actorId: input.actorId,
      action: input.action,
      target: input.target,
      timestamp: input.timestamp,
    });
  }
}

/**
 * REQ-013 — legal retention end date: 31 December of
 * (issue year + invoiceRetentionYears).
 */
export function retainedUntil(
  issuedAt: string | null,
  period: string,
  invoiceRetentionYears: number,
): string {
  const yearFromIssued = issuedAt ? Date.parse(issuedAt) : Number.NaN;
  let issueYear: number;
  if (!Number.isNaN(yearFromIssued)) {
    issueYear = new Date(yearFromIssued).getUTCFullYear();
  } else {
    const periodYear = Number.parseInt(period.slice(0, 4), 10);
    issueYear = Number.isFinite(periodYear)
      ? periodYear
      : new Date().getUTCFullYear();
  }
  return `${issueYear + invoiceRetentionYears}-12-31`;
}
