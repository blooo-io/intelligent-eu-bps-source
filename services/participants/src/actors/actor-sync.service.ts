import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { OutboxService } from "@intelligent/module-template";
import { ParticipantsStore } from "../domain/store.js";
import type { ParticipantRecord, PostalAddress } from "../domain/types.js";
import { IDP_ADMIN_PORT, type IdpAdminPort } from "../idp/idp.port.js";
import { deriveReadiness } from "../participants/readiness.js";
import {
  ACTOR_SOURCE_PORT,
  type ActorRecord,
  type ActorSourcePort,
} from "./actor-source.port.js";

const PRODUCER = "AC-03";

export function formatPostalAddress(address: PostalAddress): string {
  return `${address.street}, ${address.postalCode} ${address.city}, ${address.country}`;
}

/**
 * REQ-008 / REQ-058 / UAT-008 — upsert participants from ActorSourcePort.
 * CSV import remains the fallback when the port is disabled.
 */
@Injectable()
export class ActorSyncService {
  constructor(
    @Inject(ParticipantsStore) private readonly store: ParticipantsStore,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(IDP_ADMIN_PORT) private readonly idp: IdpAdminPort,
    @Optional()
    @Inject(ACTOR_SOURCE_PORT)
    private readonly source: ActorSourcePort | null,
  ) {}

  async sync(
    communityId: string,
  ): Promise<{ created: number; updated: number; skipped: number }> {
    if (!this.source) {
      throw new BadRequestException("Actor source is not configured");
    }
    const settings = this.store.getCommunity(communityId);
    if (!settings) {
      throw new NotFoundException(`Unknown community ${communityId}`);
    }

    const actors = await this.source.listActors(communityId);
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const actor of actors) {
      const result = await this.upsertActor(actor, settings.billingMode);
      if (result === "created") created += 1;
      else if (result === "updated") updated += 1;
      else skipped += 1;
    }

    return { created, updated, skipped };
  }

  private async upsertActor(
    actor: ActorRecord,
    billingMode: "live" | "virtual",
  ): Promise<"created" | "updated" | "skipped"> {
    // Conflict with a CSV-imported participant on gsyActorId — manager resolves.
    const byMarket = this.store.findByMarketActorId(actor.gsyActorId);
    if (byMarket && byMarket.source !== "ewds") {
      return "skipped";
    }

    const existing = this.store.getParticipant(actor.actorId);
    if (existing) {
      if (existing.source !== "ewds") {
        return "skipped";
      }
      if (existing.actorVersion === actor.version) {
        return "skipped";
      }
      this.store.putParticipant(applyActorProfile(existing, actor));
      return "updated";
    }

    // REQ-008 — create IdP user + invitation like the CSV import path.
    const idpUser = await this.idp.createUser({
      email: actor.contact.email,
      communityId: actor.communityId,
      role: actor.role,
    });
    await this.idp.sendInvitation(idpUser.userId);

    // REQ-058 — participantId = Actor UUID.
    const record: ParticipantRecord = {
      participantId: actor.actorId,
      communityId: actor.communityId,
      role: actor.role,
      status: "Invited",
      marketActorId: actor.gsyActorId,
      meterId: actor.meterId,
      idpUserId: idpUser.userId,
      profile: null,
      termsVersionAccepted: null,
      selfBillingMandate: false,
      paymentAccountReady: false,
      paymentBlockReason: null,
      source: "ewds",
      postalAddress: null,
      phone: null,
      termsAcceptedAt: null,
      kycVerified: false,
      actorVersion: actor.version,
    };
    const withProfile = applyActorProfile(record, actor);
    this.store.putParticipant(withProfile);

    // NFR-015 — identifiers only in ParticipantOnboarded.
    await this.outbox.append({
      aggregateType: "Participant",
      aggregateId: actor.actorId,
      type: "ParticipantOnboarded",
      producer: PRODUCER,
      communityId: actor.communityId,
      billingMode,
      data: { participantId: actor.actorId, role: actor.role },
    });

    return "created";
  }
}

function applyActorProfile(
  row: ParticipantRecord,
  actor: ActorRecord,
): ParticipantRecord {
  const next: ParticipantRecord = {
    ...row,
    marketActorId: actor.gsyActorId,
    meterId: actor.meterId,
    role: actor.role,
    source: "ewds",
    actorVersion: actor.version,
    postalAddress: { ...actor.address },
    phone: actor.contact.phone ?? null,
    profile: {
      name: actor.name.trim(),
      address: formatPostalAddress(actor.address),
      email: actor.contact.email.trim(),
    },
  };
  next.status = deriveReadiness(next);
  return next;
}
