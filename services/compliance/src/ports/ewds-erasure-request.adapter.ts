import { Logger } from "@nestjs/common";
import {
  CgwClient,
  EwdsTopicConsumer,
  InMemoryInboundStore,
  loadCgwConfig,
  type InboundMessageStore,
} from "@intelligent/ewds-client";
import type {
  ErasureOutcomeReport,
  ErasureRequestPort,
  InboundErasureRequest,
} from "../erasure/erasure-request.port.js";

/**
 * REQ-013 — GDPR data-subject request body on the EWDS erasure topic.
 * Personal data must not appear; identifiers only (NFR-002).
 */
export type GdprDataSubjectRequest = {
  actorId: string;
  communityId: string;
  type: "erasure" | "export";
  controllerRef?: string;
};

/** Minimal consumer surface (injectable in tests). */
export type ErasureTopicConsumer = {
  pull(
    max?: number,
  ): Promise<
    Array<{
      messageId: string;
      sender: string;
      body: GdprDataSubjectRequest;
    }>
  >;
  done(messageId: string, ok: boolean): Promise<void>;
};

/**
 * REQ-013 / REQ-053 — EWDS transport for WS3 `ErasureRequestPort`.
 *
 * Adapts `EwdsTopicConsumer.pull/done` to the existing
 * `onRequest` / `reportOutcome` surface (INT-429). Only pilot controller
 * DIDs in `EWDS_ERASURE_ALLOWED_DIDS` are accepted.
 */
export class EwdsErasureRequestAdapter implements ErasureRequestPort {
  private readonly logger = new Logger(EwdsErasureRequestAdapter.name);
  private handler: ((r: InboundErasureRequest) => Promise<void>) | null =
    null;
  /** externalRequestId → CGW messageId for reportOutcome → done. */
  private readonly messageByExternal = new Map<string, string>();
  private readonly allowedDids: Set<string>;
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticking = false;

  constructor(
    private readonly consumer: ErasureTopicConsumer,
    allowedDids: string[] = [],
    private readonly pollMs = 2_000,
  ) {
    this.allowedDids = new Set(allowedDids);
  }

  onRequest(handler: (r: InboundErasureRequest) => Promise<void>): void {
    this.handler = handler;
    if (!this.timer) {
      this.timer = setInterval(() => {
        void this.tick();
      }, this.pollMs);
    }
  }

  async reportOutcome(
    externalRequestId: string,
    outcome: ErasureOutcomeReport,
  ): Promise<void> {
    const messageId =
      this.messageByExternal.get(externalRequestId) ?? externalRequestId;
    await this.consumer.done(messageId, outcome.status === "completed");
    this.messageByExternal.delete(externalRequestId);
  }

  /** One pull+dispatch cycle (also used by tests). */
  async tick(): Promise<void> {
    if (this.ticking || !this.handler) return;
    this.ticking = true;
    try {
      const pulled = await this.consumer.pull();
      for (const msg of pulled) {
        if (this.allowedDids.size > 0 && !this.allowedDids.has(msg.sender)) {
          this.logger.debug(
            `erasure rejected sender=${msg.sender} messageId=${msg.messageId}`,
          );
          await this.consumer.done(msg.messageId, false);
          continue;
        }
        if (msg.body.type !== "erasure") {
          // Export requests are out of scope for this erasure port.
          await this.consumer.done(msg.messageId, true);
          continue;
        }
        const inbound: InboundErasureRequest = {
          externalRequestId: msg.messageId,
          actorId: msg.body.actorId,
          communityId: msg.body.communityId,
          issuedBy: msg.body.controllerRef ?? msg.sender,
          receivedAt: new Date().toISOString(),
        };
        this.messageByExternal.set(inbound.externalRequestId, msg.messageId);
        // NFR-002 — identifiers only in logs.
        this.logger.debug(
          `erasure intake messageId=${msg.messageId} actorId=${inbound.actorId}`,
        );
        await this.handler(inbound);
      }
    } finally {
      this.ticking = false;
    }
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

export function isGdprDataSubjectRequest(
  x: unknown,
): x is GdprDataSubjectRequest {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  if (typeof o.actorId !== "string") return false;
  if (typeof o.communityId !== "string") return false;
  if (o.type !== "erasure" && o.type !== "export") return false;
  if (o.controllerRef !== undefined && typeof o.controllerRef !== "string") {
    return false;
  }
  return true;
}

/**
 * Build a live EWDS ErasureRequestPort from env (REQ-013 / NFR-017).
 * Topic default `gdprDataSubjectRequest`; allow-list `EWDS_ERASURE_ALLOWED_DIDS`.
 */
export function createEwdsErasureRequest(
  env: NodeJS.ProcessEnv = process.env,
  deps?: {
    consumer?: ErasureTopicConsumer;
    store?: InboundMessageStore;
    cgw?: CgwClient;
  },
): EwdsErasureRequestAdapter {
  const allowedDids = parseAllowedDids(env.EWDS_ERASURE_ALLOWED_DIDS);
  if (deps?.consumer) {
    return new EwdsErasureRequestAdapter(deps.consumer, allowedDids ?? []);
  }

  const cgw =
    deps?.cgw ?? new CgwClient(loadCgwConfig(env, "ac-12-compliance"));
  const store = deps?.store ?? new InMemoryInboundStore();
  const consumer = new EwdsTopicConsumer<GdprDataSubjectRequest>(
    cgw,
    store,
    {
      fqcn:
        env.EWDS_ERASURE_FQCN?.trim() ||
        "blooo.intelligent.gdpr.sub",
      topicName: env.EWDS_ERASURE_TOPIC?.trim() || "gdprDataSubjectRequest",
      topicOwner:
        env.EWDS_TOPIC_OWNER?.trim() ||
        "integration.apps.intelligent.auth.ewc",
      ...(allowedDids ? { allowedSenders: allowedDids } : {}),
    },
    isGdprDataSubjectRequest,
  );
  return new EwdsErasureRequestAdapter(consumer, allowedDids ?? []);
}

function parseAllowedDids(raw: string | undefined): string[] | undefined {
  if (!raw?.trim()) return undefined;
  const list = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length > 0 ? list : undefined;
}
