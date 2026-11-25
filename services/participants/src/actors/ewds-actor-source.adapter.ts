import { Logger } from "@nestjs/common";
import {
  CgwClient,
  EwdsTopicConsumer,
  InMemoryInboundStore,
  PgInboundStore,
  loadCgwConfig,
  type InboundMessageStore,
} from "@intelligent/ewds-client";
import { createPgPoolExecutor } from "@intelligent/module-template";
import type { ParticipantRole, PostalAddress } from "../domain/types.js";
import type { ActorRecord, ActorSourcePort } from "./actor-source.port.js";

/**
 * REQ-008 — Actor intake body from the EWDS `actor` topic (P-ACTOR-SRC).
 * Personal data may be present; NFR-002 — never log the payload.
 */
export type ActorIntake = {
  actorId: string;
  communityId: string;
  gsyActorId: string;
  meterId: string;
  role: ParticipantRole;
  name: string;
  address: PostalAddress;
  contact: { email: string; phone?: string };
  version: string;
};

/** Minimal consumer surface used by the adapter (injectable in tests). */
export type ActorTopicConsumer = {
  pull(
    max?: number,
  ): Promise<Array<{ messageId: string; sender: string; body: ActorIntake }>>;
  done(messageId: string, ok: boolean): Promise<void>;
};

/**
 * REQ-008 / REQ-053 / NFR-002 — EWDS transport for WS3 `ActorSourcePort`.
 *
 * Adapts `EwdsTopicConsumer.pull/done` to `listActors(communityId)` by draining
 * CG messages, buffering by community, and marking processed (payload nulled).
 */
export class EwdsActorSourceAdapter implements ActorSourcePort {
  private readonly logger = new Logger(EwdsActorSourceAdapter.name);
  /** Pending intakes keyed by communityId (cross-call buffer after drain). */
  private readonly pending = new Map<
    string,
    Array<{ messageId: string; actor: ActorRecord }>
  >();

  constructor(private readonly consumer: ActorTopicConsumer) {}

  async listActors(communityId: string): Promise<ActorRecord[]> {
    const pulled = await this.consumer.pull();
    for (const msg of pulled) {
      // NFR-002 — identifiers only; never log name/email/address/payload.
      this.logger.debug(
        `actor intake messageId=${msg.messageId} communityId=${msg.body.communityId}`,
      );
      const actor = toActorRecord(msg.body);
      const bucket = this.pending.get(actor.communityId) ?? [];
      bucket.push({ messageId: msg.messageId, actor });
      this.pending.set(actor.communityId, bucket);
    }

    const forCommunity = this.pending.get(communityId) ?? [];
    this.pending.delete(communityId);

    const out: ActorRecord[] = [];
    for (const item of forCommunity) {
      // REQ-053 — mark processed so the inbound store nulls the payload.
      await this.consumer.done(item.messageId, true);
      out.push(item.actor);
    }
    return out;
  }
}

export function isActorIntake(x: unknown): x is ActorIntake {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  if (typeof o.actorId !== "string") return false;
  if (typeof o.communityId !== "string") return false;
  if (typeof o.gsyActorId !== "string") return false;
  if (typeof o.meterId !== "string") return false;
  if (o.role !== "consumer" && o.role !== "producer" && o.role !== "prosumer") {
    return false;
  }
  if (typeof o.name !== "string") return false;
  if (typeof o.version !== "string") return false;
  if (typeof o.address !== "object" || o.address === null) return false;
  const addr = o.address as Record<string, unknown>;
  if (
    typeof addr.street !== "string" ||
    typeof addr.postalCode !== "string" ||
    typeof addr.city !== "string" ||
    typeof addr.country !== "string"
  ) {
    return false;
  }
  if (typeof o.contact !== "object" || o.contact === null) return false;
  const contact = o.contact as Record<string, unknown>;
  if (typeof contact.email !== "string") return false;
  if (contact.phone !== undefined && typeof contact.phone !== "string") {
    return false;
  }
  return true;
}

function toActorRecord(body: ActorIntake): ActorRecord {
  return {
    actorId: body.actorId,
    communityId: body.communityId,
    gsyActorId: body.gsyActorId,
    meterId: body.meterId,
    role: body.role,
    name: body.name,
    address: { ...body.address },
    contact: {
      email: body.contact.email,
      ...(body.contact.phone !== undefined
        ? { phone: body.contact.phone }
        : {}),
    },
    version: body.version,
  };
}

/**
 * Build a live EWDS ActorSourcePort from env (REQ-008 / NFR-017).
 * Requires CGW_BASE_URL + CGW_API_KEY via loadCgwConfig.
 */
export function createEwdsActorSource(
  env: NodeJS.ProcessEnv = process.env,
  deps?: {
    consumer?: ActorTopicConsumer;
    store?: InboundMessageStore;
    cgw?: CgwClient;
  },
): EwdsActorSourceAdapter {
  if (deps?.consumer) {
    return new EwdsActorSourceAdapter(deps.consumer);
  }

  const cgw =
    deps?.cgw ??
    new CgwClient(loadCgwConfig(env, "ac-03-participants"));
  // INT-440 / REQ-053 — durable inbound when DATABASE_URL is set (CNPG).
  const store =
    deps?.store ??
    (env.DATABASE_URL?.trim()
      ? new PgInboundStore(createPgPoolExecutor(env.DATABASE_URL.trim()))
      : new InMemoryInboundStore());
  const allowedSenders = parseAllowedDids(env.EWDS_ACTOR_ALLOWED_DIDS);
  const consumer = new EwdsTopicConsumer<ActorIntake>(
    cgw,
    store,
    {
      fqcn:
        env.EWDS_ACTOR_FQCN?.trim() ||
        "blooo.intelligent.actors.sub",
      topicName: env.EWDS_ACTOR_TOPIC?.trim() || "actor",
      topicOwner:
        env.EWDS_TOPIC_OWNER?.trim() ||
        "integration.apps.intelligent.auth.ewc",
      ...(allowedSenders ? { allowedSenders } : {}),
    },
    isActorIntake,
  );
  return new EwdsActorSourceAdapter(consumer);
}

function parseAllowedDids(raw: string | undefined): string[] | undefined {
  if (!raw?.trim()) return undefined;
  const list = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length > 0 ? list : undefined;
}
