import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  OutboxService,
  PassthroughTransaction,
  type RecordingTransaction,
} from "@intelligent/module-template";
import { ParticipantsStore, type ParticipantWrite } from "../domain/store.js";
import { SEED_COMMUNITY_ID } from "../domain/seed.js";
import type {
  BillingProfile,
  CommunitySettings,
  CommunitySettingsWrite,
  ParticipantImportRow,
  ParticipantPatch,
  ParticipantRecord,
  ParticipantRole,
  PostalAddress,
  ReadinessStatus,
} from "../domain/types.js";
import { IDP_ADMIN_PORT, type IdpAdminPort } from "../idp/idp.port.js";
import {
  PSP_CAPABILITIES_PORT,
  type PspCapabilitiesPort,
} from "../ports/psp-capabilities.port.js";
import {
  OPEN_PERIODS_PORT,
  type OpenPeriodsPort,
} from "../ports/open-periods.port.js";
import { deriveReadiness, isInvoiceReady } from "./readiness.js";

const PRODUCER = "AC-03";

/** REQ-013 — DSAR payload assembled for AC-12 (never logged). */
export type ParticipantPersonalData = {
  participantId: string;
  communityId: string;
  role: ParticipantRole;
  source: "ewds" | "import";
  marketActorId: string;
  meterId: string;
  profile: BillingProfile;
  postalAddress: PostalAddress | null;
  phone: string | null;
  idpUserId: string | null;
  consents: {
    termsVersion: string | null;
    termsAcceptedAt: string | null;
    selfBillingMandate: boolean;
  };
  readiness: ReadinessStatus;
  kycVerified: boolean;
};

function invoiceNotReadyReason(
  row: ParticipantRecord,
  status: ParticipantRecord["status"],
): string {
  if (row.paymentBlockReason) {
    return row.paymentBlockReason;
  }
  if (status === "Offboarded") {
    return "offboarded";
  }
  if (status === "Restricted") {
    return "restricted";
  }
  // REQ-045 — terms + payment ready but KYC outstanding.
  if (
    status === "TermsAccepted" &&
    row.paymentAccountReady &&
    !row.kycVerified
  ) {
    return "kyc_not_verified";
  }
  return `readiness is ${status}`;
}

export type ResolvePartyResult = {
  participantId: string;
  communityId: string;
};

export type ReadinessResult = {
  participantId: string;
  ready: boolean;
  status: ParticipantRecord["status"];
  /** REQ-045 — mirror of AC-07 KYC; Ready also requires this. */
  kycVerified: boolean;
  reason?: string;
};

export type MeResult = {
  participantId: string;
  communityId: string;
  roles: string[];
  /** Market role (consumer | producer | prosumer) — INT-252 shell copy. */
  role: ParticipantRole;
  readiness: ParticipantRecord["status"];
  profile: BillingProfile;
  billingMode: CommunitySettings["billingMode"];
  /** REQ-045 — whether KYC is complete for billing. */
  kycVerified: boolean;
  /** REQ-050 — when the caller accepted the current terms. */
  termsAcceptedAt: string | null;
};

/**
 * AC-03 domain service — registry, settings, readiness, IdP provisioning (INT-103).
 */
@Injectable()
export class ParticipantsService {
  private readonly logger = new Logger(ParticipantsService.name);
  private tx: { run<T>(fn: () => Promise<T> | T): Promise<T> } = new PassthroughTransaction();

  /** INT-356 — registry mutations commit with the outbox when DATABASE_URL is set. */
  useTransaction(tx: RecordingTransaction<ParticipantWrite> | PassthroughTransaction): void {
    this.tx = tx;
  }

  constructor(
    @Inject(ParticipantsStore) private readonly store: ParticipantsStore,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(IDP_ADMIN_PORT) private readonly idp: IdpAdminPort,
    @Inject(PSP_CAPABILITIES_PORT)
    private readonly pspCapabilities: PspCapabilitiesPort,
    @Inject(OPEN_PERIODS_PORT)
    private readonly openPeriods: OpenPeriodsPort,
  ) {}

  /** Test seam — wipe fixture state between cases. */
  resetStore(): void {
    this.store.reset();
  }

  resolveParty(marketId: string): ResolvePartyResult {
    const row = this.store.findByMarketActorId(marketId);
    if (!row || row.status === "Offboarded") {
      throw new NotFoundException(`Unknown market actor ${marketId}`);
    }
    return {
      participantId: row.participantId,
      communityId: row.communityId,
    };
  }

  getCommunitySettings(communityId: string): CommunitySettings {
    return this.requireCommunity(communityId);
  }

  /**
   * REQ-043 / UAT-054 / A10.1 — update settings. Billing-mode transitions:
   * virtual→live needs operator + live PSP keys; live→virtual is refused.
   */
  updateCommunitySettings(
    communityId: string,
    write: CommunitySettingsWrite,
    callerRoles: string[],
  ): Promise<CommunitySettings> {
    return this.tx.run(() =>
      this.performUpdateCommunitySettings(communityId, write, callerRoles),
    );
  }

  private async performUpdateCommunitySettings(
    communityId: string,
    write: CommunitySettingsWrite,
    callerRoles: string[],
  ): Promise<CommunitySettings> {
    const current = this.store.getCommunity(communityId);
    if (!current) {
      throw new NotFoundException(`Unknown community ${communityId}`);
    }
    const modeChanging = write.billingMode !== current.billingMode;
    if (modeChanging) {
      // REQ-043 — live → virtual refused so real-money invoices stay live.
      if (current.billingMode === "live" && write.billingMode === "virtual") {
        throw new ConflictException({ code: "live_to_virtual_refused" });
      }
      if (current.billingMode === "virtual" && write.billingMode === "live") {
        if (!callerRoles.includes("operator")) {
          throw new ForbiddenException({
            code: "operator_required_for_live",
          });
        }
        const caps = await this.pspCapabilities.get();
        if (!caps.liveConfigured) {
          throw new ConflictException({ code: "live_keys_missing" });
        }
        // REQ-043 — refuse while settlement still has unbilled/open periods.
        const open = await this.openPeriods.list(communityId);
        if (open.periods.length > 0) {
          throw new ConflictException({
            code: "open_period",
            periods: open.periods,
          });
        }
      }
    }
    const { managerContactEmail: rawManagerEmail, ...rest } = write;
    const managerContactEmail = normalizeManagerEmail(rawManagerEmail);
    const next: CommunitySettings = {
      communityId,
      ...rest,
      autoPayout: write.autoPayout ?? false,
      // B2 / REQ-004 — omit or undefined keeps tariff billing off.
      tariffBilling: write.tariffBilling ?? false,
      ...(managerContactEmail ? { managerContactEmail } : {}),
    };
    this.store.putCommunity(next);
    if (modeChanging && next.billingMode === "live") {
      // REQ-043 — audit trail for live switch (identifiers only).
      await this.outbox.append({
        aggregateType: "CommunitySettings",
        aggregateId: communityId,
        type: "AuditableActionPerformed",
        producer: PRODUCER,
        communityId,
        billingMode: "live",
        data: {
          actorId: "operator",
          action: "community.billing-mode.live",
          target: `community:${communityId}`,
          timestamp: new Date().toISOString(),
        },
      });
    }
    return next;
  }

  /**
   * INT-274 / REQ-017 — e-mail for AC-11 payment notices (identifiers only in logs).
   */
  getNotificationContact(participantId: string): {
    participantId: string;
    email: string;
  } {
    const row = this.requireParticipant(participantId);
    const email = row.profile?.email?.trim() ?? "";
    if (!email) {
      throw new NotFoundException(
        `No notification contact for participant ${participantId}`,
      );
    }
    return { participantId, email };
  }

  /**
   * REQ-039 / Task 2.9 — issuer or addressee for the self-billing PDF.
   * 404 when the billing profile is missing (AC-06 holds and retries).
   */
  getInvoiceParty(participantId: string): {
    participantId: string;
    name: string;
    address: string;
    selfBillingMandate: { termsVersion: string; acceptedAt: string | null } | null;
  } {
    const row = this.requireParticipant(participantId);
    const name = row.profile?.name?.trim() ?? "";
    const address = row.profile?.address?.trim() ?? "";
    if (!name || !address) {
      throw new NotFoundException(
        `No invoice party profile for participant ${participantId}`,
      );
    }
    const selfBillingMandate =
      row.selfBillingMandate && row.termsVersionAccepted
        ? {
            termsVersion: row.termsVersionAccepted,
            // acceptedAt stays null until the T&C workstream stores a timestamp.
            acceptedAt: null as string | null,
          }
        : null;
    return { participantId, name, address, selfBillingMandate };
  }

  /**
   * REQ-061 / Task 2.9 — manager inbox for missing-payment alerts (AC-11).
   */
  getManagerContact(communityId: string): {
    communityId: string;
    email: string;
  } {
    const settings = this.requireCommunity(communityId);
    const email = settings.managerContactEmail?.trim() ?? "";
    if (!email) {
      throw new NotFoundException(
        `No manager contact for community ${communityId}`,
      );
    }
    return { communityId, email };
  }

  /** REQ-013 / REQ-049 — community of a participant for AC-12 DSR bind. */
  getParticipantCommunity(participantId: string): {
    participantId: string;
    communityId: string;
  } {
    const row = this.requireParticipant(participantId);
    return { participantId: row.participantId, communityId: row.communityId };
  }

  checkReadiness(participantId: string): ReadinessResult {
    const row = this.requireParticipant(participantId);
    const status = deriveReadiness(row);
    const ready = isInvoiceReady(status);
    const result: ReadinessResult = {
      participantId,
      ready,
      status,
      kycVerified: row.kycVerified,
    };
    if (!ready) {
      result.reason = invoiceNotReadyReason(row, status);
    }
    return result;
  }

  /**
   * INT-230 — map IdP JWT `sub` to registry participantId (Keycloak ≠ participant UUID).
   */
  resolveByIdpSub(idpUserId: string): ResolvePartyResult {
    const row = this.store.findByIdpSub(idpUserId);
    if (!row || row.status === "Offboarded") {
      throw new NotFoundException(`Unknown IdP subject ${idpUserId}`);
    }
    return {
      participantId: row.participantId,
      communityId: row.communityId,
    };
  }

  listParticipants(communityId: string): Array<{
    participantId: string;
    communityId: string;
    role: ParticipantRole;
    status: ParticipantRecord["status"];
    marketActorId: string;
    meterId: string;
    /** INT-283 — directory label for managers (REQ-008). */
    name?: string;
    email?: string;
  }> {
    if (!this.store.getCommunity(communityId)) {
      throw new NotFoundException(`Unknown community ${communityId}`);
    }
    return this.store.listByCommunity(communityId).map((row) => ({
      participantId: row.participantId,
      communityId: row.communityId,
      role: row.role,
      status: deriveReadiness(row),
      marketActorId: row.marketActorId,
      meterId: row.meterId,
      ...(row.profile?.name?.trim()
        ? { name: row.profile.name.trim() }
        : {}),
      ...(row.profile?.email?.trim()
        ? { email: row.profile.email.trim() }
        : {}),
    }));
  }

  async importParticipants(
    communityId: string,
    rows: ParticipantImportRow[],
  ): Promise<
    Array<{
      participantId: string;
      communityId: string;
      role: ParticipantRole;
      status: ParticipantRecord["status"];
      marketActorId: string;
      meterId: string;
    }>
  > {
    return this.tx.run(() => this.performImportParticipants(communityId, rows));
  }

  private async performImportParticipants(
    communityId: string,
    rows: ParticipantImportRow[],
  ): Promise<
    Array<{
      participantId: string;
      communityId: string;
      role: ParticipantRole;
      status: ParticipantRecord["status"];
      marketActorId: string;
      meterId: string;
    }>
  > {
    const settings = this.store.getCommunity(communityId);
    if (!settings) {
      throw new NotFoundException(`Unknown community ${communityId}`);
    }
    if (rows.length === 0) {
      throw new BadRequestException("participants must not be empty");
    }
    const created = [];
    for (const row of rows) {
      const existingMarket = this.store.findByMarketActorId(row.marketActorId);
      if (existingMarket) {
        // REQ-058 — CSV must not overwrite an EWDS-sourced actor.
        if (existingMarket.source === "ewds") {
          throw new BadRequestException(
            "marketActorId already sourced from EWDS",
          );
        }
        throw new BadRequestException(
          `marketActorId already registered: ${row.marketActorId}`,
        );
      }
      // REQ-008: create participant, IdP account, invitation —
      // or bind an already-provisioned IdP subject (INT-180).
      let idpUserId: string;
      if (row.existingIdpSubject) {
        if (this.store.findByIdpSub(row.existingIdpSubject)) {
          throw new BadRequestException(
            `existingIdpSubject already registered: ${row.existingIdpSubject}`,
          );
        }
        idpUserId = row.existingIdpSubject;
      } else {
        const idpUser = await this.idp.createUser({
          email: row.email,
          communityId,
          role: row.role,
        });
        await this.idp.sendInvitation(idpUser.userId);
        idpUserId = idpUser.userId;
      }
      const participantId = randomUUID();
      const record: ParticipantRecord = {
        participantId,
        communityId,
        role: row.role,
        status: "Invited",
        marketActorId: row.marketActorId,
        meterId: row.meterId,
        idpUserId,
        profile: {
          name: "",
          address: "",
          email: row.email,
        },
        termsVersionAccepted: null,
        selfBillingMandate: false,
        paymentAccountReady: false,
        paymentBlockReason: null,
        source: "import",
        postalAddress: null,
        phone: null,
        termsAcceptedAt: null,
        kycVerified: false,
        actorVersion: null,
      };
      this.store.putParticipant(record);
      await this.outbox.append({
        aggregateType: "Participant",
        aggregateId: participantId,
        type: "ParticipantOnboarded",
        producer: PRODUCER,
        communityId,
        billingMode: settings.billingMode,
        data: { participantId, role: row.role },
      });
      created.push({
        participantId,
        communityId,
        role: row.role,
        status: "Invited" as const,
        marketActorId: row.marketActorId,
        meterId: row.meterId,
      });
    }
    return created;
  }

  patchParticipant(
    participantId: string,
    patch: ParticipantPatch,
  ): {
    participantId: string;
    communityId: string;
    role: ParticipantRole;
    status: ParticipantRecord["status"];
    marketActorId: string;
    meterId: string;
  } {
    const row = this.requireParticipant(participantId);
    if (row.status === "Offboarded") {
      throw new BadRequestException("Cannot patch an offboarded participant");
    }
    if (
      patch.marketActorId &&
      patch.marketActorId !== row.marketActorId &&
      this.store.findByMarketActorId(patch.marketActorId)
    ) {
      throw new BadRequestException("marketActorId already registered");
    }
    // REQ-009 / REQ-058: manager changes attribution identifiers.
    const next: ParticipantRecord = {
      ...row,
      marketActorId: patch.marketActorId ?? row.marketActorId,
      meterId: patch.meterId ?? row.meterId,
      role: patch.role ?? row.role,
    };
    next.status = deriveReadiness(next);
    this.store.putParticipant(next);
    return {
      participantId: next.participantId,
      communityId: next.communityId,
      role: next.role,
      status: next.status,
      marketActorId: next.marketActorId,
      meterId: next.meterId,
    };
  }

  async offboardParticipant(participantId: string): Promise<{
    participantId: string;
    communityId: string;
    role: ParticipantRole;
    status: ParticipantRecord["status"];
    marketActorId: string;
    meterId: string;
  }> {
    return this.tx.run(() => this.performOffboardParticipant(participantId));
  }

  private async performOffboardParticipant(participantId: string): Promise<{
    participantId: string;
    communityId: string;
    role: ParticipantRole;
    status: ParticipantRecord["status"];
    marketActorId: string;
    meterId: string;
  }> {
    const row = this.requireParticipant(participantId);
    if (row.status === "Offboarded") {
      return {
        participantId: row.participantId,
        communityId: row.communityId,
        role: row.role,
        status: "Offboarded",
        marketActorId: row.marketActorId,
        meterId: row.meterId,
      };
    }
    const settings = this.requireCommunity(row.communityId);
    const next: ParticipantRecord = { ...row, status: "Offboarded" };
    this.store.putParticipant(next);
    if (row.idpUserId) {
      await this.idp.deleteUser(row.idpUserId);
    }
    const effectiveAt = new Date().toISOString();
    // REQ-012: offboard triggers final settlement via event to AC-05.
    await this.outbox.append({
      aggregateType: "Participant",
      aggregateId: participantId,
      type: "ParticipantOffboarded",
      producer: PRODUCER,
      communityId: row.communityId,
      billingMode: settings.billingMode,
      data: { participantId, effectiveAt },
    });
    return {
      participantId: next.participantId,
      communityId: next.communityId,
      role: next.role,
      status: "Offboarded",
      marketActorId: next.marketActorId,
      meterId: next.meterId,
    };
  }

  getMe(sub: string, roles: string[]): MeResult {
    const row = this.store.findByIdpSub(sub);
    if (!row || row.status === "Offboarded") {
      throw new NotFoundException("Caller is not a registered participant");
    }
    const settings = this.requireCommunity(row.communityId);
    const readiness = deriveReadiness(row);
    return {
      participantId: row.participantId,
      communityId: row.communityId,
      roles,
      role: row.role,
      readiness,
      profile: row.profile ?? { name: "", address: "", email: "" },
      billingMode: settings.billingMode,
      kycVerified: row.kycVerified,
      termsAcceptedAt: row.termsAcceptedAt,
    };
  }

  async updateProfile(sub: string, profile: BillingProfile): Promise<BillingProfile> {
    return this.tx.run(() => this.performUpdateProfile(sub, profile));
  }

  private async performUpdateProfile(sub: string, profile: BillingProfile): Promise<BillingProfile> {
    const row = this.store.findByIdpSub(sub);
    if (!row || row.status === "Offboarded") {
      throw new NotFoundException("Caller is not a registered participant");
    }
    // INT-447 / REQ-009 — EWDS Actor is master for source=ewds; R2M republishes Actor.
    if (row.source === "ewds") {
      throw new ConflictException({ code: "profile_managed_by_ewds" });
    }
    if (!profile.name.trim() || !profile.address.trim() || !profile.email.trim()) {
      throw new BadRequestException("name, address and email are required");
    }
    const previousStatus = deriveReadiness(row);
    const next: ParticipantRecord = {
      ...row,
      profile: {
        name: profile.name.trim(),
        address: profile.address.trim(),
        email: profile.email.trim(),
      },
    };
    next.status = deriveReadiness(next);
    this.store.putParticipant(next);
    await this.emitReadinessIfChanged(row, previousStatus, next);
    return next.profile!;
  }

  getCurrentTerms() {
    return this.store.getTerms();
  }

  /**
   * REQ-050 / UAT-062 — record T&C acceptance with timestamp.
   * Members store termsAcceptedAt on the participant; managers store
   * ManagerConsent. Producer/prosumer still require the self-billing mandate.
   */
  async acceptTerms(
    sub: string,
    roles: string[],
    input: { termsVersion: string; selfBillingMandate: boolean },
    communityId?: string,
  ): Promise<{
    termsVersion: string;
    selfBillingMandate: boolean;
    acceptedAt: string;
  }> {
    return this.tx.run(() =>
      this.performAcceptTerms(sub, roles, input, communityId),
    );
  }

  /**
   * INT-447 / REQ-050 / REQ-052 — EWDS command channel target.
   * Resolves actorId → member ParticipantRecord and/or manager binding.
   */
  async acceptTermsForActor(
    actorId: string,
    input: { termsVersion: string; selfBillingMandate: boolean },
  ): Promise<{
    termsVersion: string;
    selfBillingMandate: boolean;
    acceptedAt: string;
  }> {
    return this.tx.run(() => this.performAcceptTermsForActor(actorId, input));
  }

  private async performAcceptTermsForActor(
    actorId: string,
    input: { termsVersion: string; selfBillingMandate: boolean },
  ): Promise<{
    termsVersion: string;
    selfBillingMandate: boolean;
    acceptedAt: string;
  }> {
    const current = this.store.getTerms();
    if (input.termsVersion !== current.termsVersion) {
      throw new BadRequestException("termsVersion does not match current terms");
    }
    const acceptedAt = new Date().toISOString();
    const row = this.store.getParticipant(actorId);
    if (!row || row.status === "Offboarded") {
      throw new NotFoundException(`Unknown actor ${actorId}`);
    }
    // REQ-050: producers must accept the self-billing mandate.
    if (
      (row.role === "producer" || row.role === "prosumer") &&
      !input.selfBillingMandate
    ) {
      throw new BadRequestException(
        "selfBillingMandate is required for producers",
      );
    }
    const previousStatus = deriveReadiness(row);
    const next: ParticipantRecord = {
      ...row,
      termsVersionAccepted: input.termsVersion,
      selfBillingMandate: input.selfBillingMandate,
      termsAcceptedAt: acceptedAt,
    };
    next.status = deriveReadiness(next);
    this.store.putParticipant(next);
    await this.emitReadinessIfChanged(row, previousStatus, next);
    await this.emitTermsAcceptedAudit(
      row.participantId,
      row.communityId,
      input.termsVersion,
      acceptedAt,
    );
    return {
      termsVersion: input.termsVersion,
      selfBillingMandate: input.selfBillingMandate,
      acceptedAt,
    };
  }

  private async performAcceptTerms(
    sub: string,
    roles: string[],
    input: { termsVersion: string; selfBillingMandate: boolean },
    communityId?: string,
  ): Promise<{
    termsVersion: string;
    selfBillingMandate: boolean;
    acceptedAt: string;
  }> {
    const current = this.store.getTerms();
    if (input.termsVersion !== current.termsVersion) {
      throw new BadRequestException("termsVersion does not match current terms");
    }
    const acceptedAt = new Date().toISOString();
    const isManager = roles.includes("manager");
    const isMemberPath = roles.includes("member");
    const row = this.store.findByIdpSub(sub);

    if (isMemberPath) {
      if (!row || row.status === "Offboarded") {
        throw new NotFoundException("Caller is not a registered participant");
      }
      // REQ-050: producers must accept the self-billing mandate.
      if (
        (row.role === "producer" || row.role === "prosumer") &&
        !input.selfBillingMandate
      ) {
        throw new BadRequestException(
          "selfBillingMandate is required for producers",
        );
      }
      const previousStatus = deriveReadiness(row);
      const next: ParticipantRecord = {
        ...row,
        termsVersionAccepted: input.termsVersion,
        selfBillingMandate: input.selfBillingMandate,
        termsAcceptedAt: acceptedAt,
      };
      next.status = deriveReadiness(next);
      this.store.putParticipant(next);
      await this.emitReadinessIfChanged(row, previousStatus, next);
      await this.emitTermsAcceptedAudit(
        row.participantId,
        row.communityId,
        input.termsVersion,
        acceptedAt,
      );
    }

    if (isManager) {
      const mgrCommunityId = communityId || row?.communityId;
      if (!mgrCommunityId) {
        throw new BadRequestException("communityId is required for manager consent");
      }
      if (!this.store.getCommunity(mgrCommunityId)) {
        throw new NotFoundException(`Unknown community ${mgrCommunityId}`);
      }
      // REQ-050 — manager consent is separate from member ParticipantRecord.
      this.store.putManagerConsent({
        subjectId: sub,
        communityId: mgrCommunityId,
        termsVersion: input.termsVersion,
        acceptedAt,
      });
      if (!isMemberPath) {
        await this.emitTermsAcceptedAudit(
          sub,
          mgrCommunityId,
          input.termsVersion,
          acceptedAt,
        );
      }
    }

    if (!isMemberPath && !isManager) {
      throw new NotFoundException("Caller is not a registered participant");
    }

    return {
      termsVersion: input.termsVersion,
      selfBillingMandate: input.selfBillingMandate,
      acceptedAt,
    };
  }

  private async emitTermsAcceptedAudit(
    actorId: string,
    communityId: string,
    termsVersion: string,
    timestamp: string,
  ): Promise<void> {
    const settings = this.store.getCommunity(communityId);
    // REQ-050 / REQ-030 — identifiers only (NFR-015).
    await this.outbox.append({
      aggregateType: "TermsAcceptance",
      aggregateId: actorId,
      type: "AuditableActionPerformed",
      producer: PRODUCER,
      communityId,
      billingMode: settings?.billingMode ?? "virtual",
      data: {
        actorId,
        action: "terms.accepted",
        target: `participant:${actorId}|version:${termsVersion}`,
        timestamp,
      },
    });
  }

  /**
   * Apply PaymentAccountStatusChanged from AC-07 (drives Ready / Restricted).
   */
  async applyPaymentAccountStatus(input: {
    participantId: string;
    ready: boolean;
    reason?: string;
  }): Promise<ReadinessResult> {
    return this.tx.run(() => this.performApplyPaymentAccountStatus(input));
  }

  private async performApplyPaymentAccountStatus(input: {
    participantId: string;
    ready: boolean;
    reason?: string;
  }): Promise<ReadinessResult> {
    const row = this.requireParticipant(input.participantId);
    if (row.status === "Offboarded") {
      throw new BadRequestException("Offboarded participant");
    }
    const previousStatus = deriveReadiness(row);
    const next: ParticipantRecord = {
      ...row,
      paymentAccountReady: input.ready,
      paymentBlockReason: input.ready
        ? null
        : (input.reason ?? "payment_account"),
    };
    next.status = deriveReadiness(next);
    this.store.putParticipant(next);
    await this.emitReadinessIfChanged(row, previousStatus, next);
    return this.checkReadiness(input.participantId);
  }

  /**
   * REQ-051 / REQ-045 — apply KycStatusChanged (subjectType=participant) so
   * readiness mirrors AC-07 KYC (BR-09 gate for invoices and statements).
   */
  async applyKycStatus(input: {
    eventId: string;
    participantId: string;
    kycVerified: boolean;
  }): Promise<ReadinessResult> {
    return this.tx.run(() => this.performApplyKycStatus(input));
  }

  private async performApplyKycStatus(input: {
    eventId: string;
    participantId: string;
    kycVerified: boolean;
  }): Promise<ReadinessResult> {
    const row = this.requireParticipant(input.participantId);
    if (row.status === "Offboarded") {
      throw new BadRequestException("Offboarded participant");
    }
    const previousStatus = deriveReadiness(row);
    const next: ParticipantRecord = {
      ...row,
      kycVerified: input.kycVerified,
      // Clear payment-block when KYC is restored without a separate payment event.
      paymentBlockReason:
        input.kycVerified && row.paymentBlockReason === "kyc_revoked"
          ? null
          : row.paymentBlockReason,
    };
    next.status = deriveReadiness(next);
    this.store.putParticipant(next);
    await this.emitReadinessIfChanged(row, previousStatus, next);
    return this.checkReadiness(input.participantId);
  }

  /** Default seeded community id for tests and local smoke. */
  seedCommunityId(): string {
    return SEED_COMMUNITY_ID;
  }

  /**
   * REQ-013 / Task 3.18 — personal data for DSAR export (service-role only).
   * Identifiers and values are returned to AC-12; never written to logs.
   */
  getPersonalData(participantId: string): ParticipantPersonalData {
    const row = this.requireParticipant(participantId);
    // NFR-015 — log ids only; never the profile / contact payload.
    this.logger.log(`personal-data requested for participantId=${participantId}`);
    return {
      participantId: row.participantId,
      communityId: row.communityId,
      role: row.role,
      source: row.source,
      marketActorId: row.marketActorId,
      meterId: row.meterId,
      profile: row.profile ?? { name: "", address: "", email: "" },
      postalAddress: row.postalAddress,
      phone: row.phone,
      idpUserId: row.idpUserId,
      consents: {
        termsVersion: row.termsVersionAccepted,
        termsAcceptedAt: row.termsAcceptedAt,
        selfBillingMandate: row.selfBillingMandate,
      },
      readiness: deriveReadiness(row),
      kycVerified: row.kycVerified,
    };
  }

  /**
   * REQ-013 / Task 3.18 — delete the Keycloak user. HTTP 404 counts as erased.
   * Local anonymization stays on {@link applyErasureRequested}.
   */
  async eraseIdentity(participantId: string): Promise<{ erased: boolean }> {
    const row = this.requireParticipant(participantId);
    if (!row.idpUserId) {
      return { erased: true };
    }
    try {
      await this.idp.deleteUser(row.idpUserId);
      return { erased: true };
    } catch (err) {
      // Keycloak adapter already treats 404 as success; other adapters may throw.
      if (isNotFoundError(err)) {
        return { erased: true };
      }
      throw err;
    }
  }

  /**
   * REQ-013 / INT-275 — anonymize registry personal data; emit ErasureCompleted (AC-03).
   * IdP deletion is {@link eraseIdentity} (Task 3.18) — called by AC-12 separately.
   */
  async applyErasureRequested(input: {
    requestId: string;
    participantId: string;
  }): Promise<{ result: "completed" | "failed" }> {
    return this.tx.run(() => this.performApplyErasureRequested(input));
  }

  private async performApplyErasureRequested(input: {
    requestId: string;
    participantId: string;
  }): Promise<{ result: "completed" | "failed" }> {
    const row = this.store.getParticipant(input.participantId);
    if (!row) {
      await this.publishErasureCompleted(
        input.requestId,
        "failed",
        SEED_COMMUNITY_ID,
      );
      return { result: "failed" };
    }
    const next: ParticipantRecord = {
      ...row,
      profile: row.profile
        ? { name: "[erased]", address: "[erased]", email: "[erased]" }
        : null,
      postalAddress: null,
      phone: null,
      idpUserId: null,
    };
    this.store.putParticipant(next);
    await this.publishErasureCompleted(
      input.requestId,
      "completed",
      row.communityId,
    );
    return { result: "completed" };
  }

  private async publishErasureCompleted(
    requestId: string,
    result: "completed" | "failed",
    communityId: string,
  ): Promise<void> {
    const settings = this.store.getCommunity(communityId);
    await this.outbox.append({
      aggregateType: "DataSubjectRequest",
      aggregateId: requestId,
      type: "ErasureCompleted",
      producer: PRODUCER,
      communityId,
      billingMode: settings?.billingMode ?? "virtual",
      data: {
        requestId,
        module: "AC-03",
        result,
      },
    });
  }

  private requireParticipant(participantId: string): ParticipantRecord {
    const row = this.store.getParticipant(participantId);
    if (!row) {
      throw new NotFoundException(`Unknown participant ${participantId}`);
    }
    return row;
  }

  private requireCommunity(communityId: string): CommunitySettings {
    const settings = this.store.getCommunity(communityId);
    if (!settings) {
      throw new NotFoundException(`Unknown community ${communityId}`);
    }
    return settings;
  }

  private async emitReadinessIfChanged(
    _previous: ParticipantRecord,
    previousStatus: ParticipantRecord["status"],
    next: ParticipantRecord,
  ): Promise<void> {
    const nextStatus = deriveReadiness(next);
    if (previousStatus === nextStatus) {
      return;
    }
    const settings = this.requireCommunity(next.communityId);
    await this.outbox.append({
      aggregateType: "Participant",
      aggregateId: next.participantId,
      type: "ParticipantReadinessChanged",
      producer: PRODUCER,
      communityId: next.communityId,
      billingMode: settings.billingMode,
      data: {
        participantId: next.participantId,
        ready: isInvoiceReady(nextStatus),
        reason:
          nextStatus !== "Ready"
            ? invoiceNotReadyReason(next, nextStatus)
            : undefined,
      },
    });
  }
}

/** REQ-061 — optional manager inbox; empty/undefined clears the field. */
function normalizeManagerEmail(
  value: string | undefined,
): string | undefined {
  if (value === undefined) return undefined;
  const email = value.trim();
  if (email === "") return undefined;
  // Practical e-mail shape (OpenAPI format: email); reject obvious junk.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new BadRequestException("managerContactEmail must be a valid e-mail");
  }
  return email;
}

/** REQ-013 — Keycloak (and stubs) may surface missing users as 404-like errors. */
function isNotFoundError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const status =
    "status" in err
      ? Number((err as { status?: unknown }).status)
      : "statusCode" in err
        ? Number((err as { statusCode?: unknown }).statusCode)
        : NaN;
  if (status === 404) return true;
  const message = err instanceof Error ? err.message : String(err);
  return /\b404\b|not\s*found/i.test(message);
}
