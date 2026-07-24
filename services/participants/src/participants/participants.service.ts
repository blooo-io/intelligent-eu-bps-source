import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { OutboxService } from "@intelligent/module-template";
import { ParticipantsStore } from "../domain/store.js";
import { SEED_COMMUNITY_ID } from "../domain/seed.js";
import type {
  BillingProfile,
  CommunitySettings,
  ParticipantImportRow,
  ParticipantPatch,
  ParticipantRecord,
  ParticipantRole,
} from "../domain/types.js";
import { IDP_ADMIN_PORT, type IdpAdminPort } from "../idp/idp.port.js";
import { deriveReadiness, isInvoiceReady } from "./readiness.js";

const PRODUCER = "AC-03";

export type ResolvePartyResult = {
  participantId: string;
  communityId: string;
};

export type ReadinessResult = {
  participantId: string;
  ready: boolean;
  status: ParticipantRecord["status"];
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
};

/**
 * AC-03 domain service — registry, settings, readiness, IdP provisioning (INT-103).
 */
@Injectable()
export class ParticipantsService {
  constructor(
    @Inject(ParticipantsStore) private readonly store: ParticipantsStore,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(IDP_ADMIN_PORT) private readonly idp: IdpAdminPort,
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
    const settings = this.store.getCommunity(communityId);
    if (!settings) {
      throw new NotFoundException(`Unknown community ${communityId}`);
    }
    return settings;
  }

  updateCommunitySettings(
    communityId: string,
    write: Omit<CommunitySettings, "communityId">,
  ): CommunitySettings {
    if (!this.store.getCommunity(communityId)) {
      throw new NotFoundException(`Unknown community ${communityId}`);
    }
    // V1 communities are virtual (REQ-043); refuse live until post-V1.
    if (write.billingMode === "live") {
      throw new BadRequestException("V1 communities must remain virtual");
    }
    const next: CommunitySettings = { communityId, ...write };
    this.store.putCommunity(next);
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

  checkReadiness(participantId: string): ReadinessResult {
    const row = this.requireParticipant(participantId);
    const status = deriveReadiness(row);
    const ready = isInvoiceReady(status);
    const result: ReadinessResult = {
      participantId,
      ready,
      status,
    };
    if (!ready) {
      result.reason =
        row.paymentBlockReason ??
        (status === "Offboarded"
          ? "offboarded"
          : status === "Restricted"
            ? "restricted"
            : `readiness is ${status}`);
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
    const settings = this.store.getCommunity(communityId);
    if (!settings) {
      throw new NotFoundException(`Unknown community ${communityId}`);
    }
    if (rows.length === 0) {
      throw new BadRequestException("participants must not be empty");
    }
    const created = [];
    for (const row of rows) {
      if (this.store.findByMarketActorId(row.marketActorId)) {
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
    };
  }

  async updateProfile(sub: string, profile: BillingProfile): Promise<BillingProfile> {
    const row = this.store.findByIdpSub(sub);
    if (!row || row.status === "Offboarded") {
      throw new NotFoundException("Caller is not a registered participant");
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

  async acceptTerms(
    sub: string,
    input: { termsVersion: string; selfBillingMandate: boolean },
  ): Promise<{
    termsVersion: string;
    selfBillingMandate: boolean;
    acceptedAt: string;
  }> {
    const row = this.store.findByIdpSub(sub);
    if (!row || row.status === "Offboarded") {
      throw new NotFoundException("Caller is not a registered participant");
    }
    const current = this.store.getTerms();
    if (input.termsVersion !== current.termsVersion) {
      throw new BadRequestException("termsVersion does not match current terms");
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
    const acceptedAt = new Date().toISOString();
    const next: ParticipantRecord = {
      ...row,
      termsVersionAccepted: input.termsVersion,
      selfBillingMandate: input.selfBillingMandate,
    };
    next.status = deriveReadiness(next);
    this.store.putParticipant(next);
    await this.emitReadinessIfChanged(row, previousStatus, next);
    return {
      termsVersion: input.termsVersion,
      selfBillingMandate: input.selfBillingMandate,
      acceptedAt,
    };
  }

  /**
   * Apply PaymentAccountStatusChanged from AC-07 (drives Ready / Restricted).
   */
  async applyPaymentAccountStatus(input: {
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

  /** Default seeded community id for tests and local smoke. */
  seedCommunityId(): string {
    return SEED_COMMUNITY_ID;
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
    previous: ParticipantRecord,
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
          next.paymentBlockReason ??
          (nextStatus !== "Ready" ? `readiness is ${nextStatus}` : undefined),
      },
    });
    void previous;
  }
}
