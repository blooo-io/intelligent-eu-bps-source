import { Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import {
  CgwClient,
  EwdsTopicConsumer,
  InMemoryInboundStore,
  PgInboundStore,
  loadCgwConfig,
  type InboundMessageStore,
} from "@intelligent/ewds-client";
import {
  createPgPoolExecutor,
  type OutboxService,
} from "@intelligent/module-template";
import { parseAllowedCommandDids } from "./command-authorizer.js";
import { CommandAuthorizer } from "./command-authorizer.js";
import {
  CommandDispatcher,
  type CommandInboundMessage,
} from "./command-dispatcher.js";
import {
  HttpCommandTargetsClient,
  parseReturnUrlPrefixes,
} from "./command-targets.client.js";
import { HttpInvoiceLookupClient } from "./invoice-lookup.client.js";
import { HttpActorAuthzClient } from "./participants-authz.client.js";
import {
  InMemoryProcessedCommandsStore,
  type ProcessedCommandsStore,
} from "./processed-commands.store.js";
import type { BillingCommandRequest } from "./billing-command.types.js";

const DEFAULT_REPLY_FQCN = "blooo.intelligent.billing.replies.pub";
const DEFAULT_COMMAND_FQCN = "blooo.intelligent.billing.commands.sub";
const DEFAULT_POLL_MS = 2_000;
const DAY_MS = 24 * 3600 * 1000;

/** Minimal consumer surface used by the poller (injectable in tests). */
export type CommandTopicConsumer = {
  pull(
    max?: number,
  ): Promise<
    Array<{
      messageId: string;
      sender: string;
      body: BillingCommandRequest;
      signatureValid?: boolean;
    }>
  >;
  done(messageId: string, ok: boolean): Promise<void>;
};

export type CommandReplySender = {
  send(m: {
    fqcn: string;
    topicName: string;
    topicVersion?: string;
    topicOwner?: string;
    transactionId?: string;
    payload: unknown;
  }): Promise<{ messageId: string; sent: number; failed: number }>;
};

export type CommandPollerOpts = {
  replyFqcn: string;
  pollMs: number;
  topicOwner?: string;
  topicVersion?: string;
};

/**
 * REQ-052 (A7) / REQ-053 — EWDS command channel poller.
 * Starts only when `COMMAND_CHANNEL_ENABLED === "true"`.
 */
export class CommandPoller implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CommandPoller.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private purgeTimer: ReturnType<typeof setInterval> | null = null;
  private ticking = false;
  private readonly pending: CommandInboundMessage[] = [];
  private readonly enabled: boolean;

  constructor(
    private readonly consumer: CommandTopicConsumer,
    private readonly dispatcher: CommandDispatcher,
    private readonly cgw: CommandReplySender,
    private readonly processed: ProcessedCommandsStore,
    private readonly opts: CommandPollerOpts,
    enabled: boolean,
  ) {
    this.enabled = enabled;
  }

  onModuleInit(): void {
    if (!this.enabled) {
      this.logger.log("COMMAND_CHANNEL_ENABLED unset/false — poller not started");
      return;
    }
    this.timer = setInterval(() => {
      void this.tick();
    }, this.opts.pollMs);
    this.purgeTimer = setInterval(() => {
      void this.purge(new Date());
    }, DAY_MS);
    // Kick once at boot.
    void this.tick();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.purgeTimer) clearInterval(this.purgeTimer);
    this.timer = null;
    this.purgeTimer = null;
  }

  /** REQ-053 — drop processed replies older than 7 days. */
  async purge(now: Date): Promise<number> {
    return this.processed.purge(now);
  }

  /**
   * One poll cycle: drain pending retries + new pulls, dispatch, reply via CGW.
   * Re-entry guarded — overlapping ticks are skipped.
   */
  async tick(): Promise<void> {
    if (!this.enabled || this.ticking) return;
    this.ticking = true;
    try {
      const pulled = await this.consumer.pull();
      const pendingIds = new Set(this.pending.map((p) => p.messageId));
      for (const m of pulled) {
        if (pendingIds.has(m.messageId)) continue;
        this.pending.push({
          messageId: m.messageId,
          sender: m.sender,
          signatureValid: m.signatureValid ?? true,
          body: m.body,
        });
        pendingIds.add(m.messageId);
      }

      const stillPending: CommandInboundMessage[] = [];
      for (const msg of this.pending) {
        const reply = await this.dispatcher.handle(msg);
        if (reply === null) {
          // Layer-2 drop — mark processed, no reply.
          await this.consumer.done(msg.messageId, true);
          continue;
        }

        // Idempotent: only send if we have a reply for a request we hold.
        try {
          await this.cgw.send({
            fqcn: this.opts.replyFqcn,
            topicName: "billingCommandReply",
            topicVersion: this.opts.topicVersion ?? "1.0.0",
            topicOwner:
              this.opts.topicOwner ??
              "integration.apps.intelligent.auth.ewc",
            transactionId: reply.requestId,
            payload: reply,
          });
          await this.consumer.done(msg.messageId, true);
        } catch (err) {
          // Reply send failure — leave as received; retry next tick.
          this.logger.warn(
            `reply send failed for requestId=${reply.requestId}; will retry`,
          );
          stillPending.push(msg);
          void err;
        }
      }
      this.pending.length = 0;
      this.pending.push(...stillPending);
    } catch (err) {
      // INT-439 — CGW pull 400 (charset / CHANNEL::NOT_FOUND) must not CrashLoop.
      this.logger.warn(
        `command poll failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      this.ticking = false;
    }
  }
}

/**
 * Build the command poller from env. When COMMAND_CHANNEL_ENABLED is not
 * `"true"`, returns a disabled poller that never calls CGW.
 */
export function createCommandPoller(
  env: NodeJS.ProcessEnv = process.env,
  deps?: {
    outbox?: OutboxService;
    consumer?: CommandTopicConsumer;
    dispatcher?: CommandDispatcher;
    cgw?: CommandReplySender;
    processed?: ProcessedCommandsStore;
    inboundStore?: InboundMessageStore;
  },
): CommandPoller {
  const enabled = env.COMMAND_CHANNEL_ENABLED === "true";
  const processed = deps?.processed ?? new InMemoryProcessedCommandsStore();

  if (!enabled) {
    const noopConsumer: CommandTopicConsumer = {
      pull: async () => [],
      done: async () => {},
    };
    const noopCgw: CommandReplySender = {
      send: async () => {
        throw new Error("CGW must not be called when command channel disabled");
      },
    };
    // Minimal dispatcher stub — never invoked when disabled.
    const stubDispatcher = {
      handle: async () => null,
    } as unknown as CommandDispatcher;
    return new CommandPoller(
      noopConsumer,
      stubDispatcher,
      noopCgw,
      processed,
      { replyFqcn: DEFAULT_REPLY_FQCN, pollMs: DEFAULT_POLL_MS },
      false,
    );
  }

  // Review focus §4 — refuse to start without reply-channel encryption guard.
  if (env.EWDS_REPLY_ENCRYPTED !== "true") {
    throw new Error(
      "COMMAND_CHANNEL_ENABLED=true requires EWDS_REPLY_ENCRYPTED=true (payload encryption on billing.replies)",
    );
  }

  const outbox = deps?.outbox;
  if (!outbox) {
    throw new Error("createCommandPoller requires OutboxService when enabled");
  }

  const allowedDids = parseAllowedCommandDids(env.EWDS_COMMAND_ALLOWED_DIDS);
  const returnUrlPrefixes = parseReturnUrlPrefixes(
    env.EWDS_COMMAND_RETURN_URL_PREFIXES,
  );

  const participantsUrl =
    env.PARTICIPANTS_INTERNAL_URL?.trim() || "http://participants:8080";
  const paymentsUrl =
    env.PAYMENTS_INTERNAL_URL?.trim() || "http://payments:8080";
  const invoicingUrl =
    env.INVOICING_INTERNAL_URL?.trim() || "http://invoicing:8080";
  const notificationUrl =
    env.NOTIFICATION_INTERNAL_URL?.trim() || "http://notification:8080";
  const settlementUrl =
    env.SETTLEMENT_INTERNAL_URL?.trim() || "http://settlement:8080";

  const authorizer = new CommandAuthorizer(
    allowedDids,
    new HttpActorAuthzClient(participantsUrl),
    new HttpInvoiceLookupClient(invoicingUrl),
  );
  const targets = new HttpCommandTargetsClient({
    paymentsBaseUrl: paymentsUrl,
    invoicingBaseUrl: invoicingUrl,
    notificationBaseUrl: notificationUrl,
    settlementBaseUrl: settlementUrl,
  });
  const dispatcher =
    deps?.dispatcher ??
    new CommandDispatcher(
      authorizer,
      targets,
      processed,
      returnUrlPrefixes,
      outbox,
      allowedDids,
    );

  const cgw =
    deps?.cgw ??
    new CgwClient(loadCgwConfig(env, "ac-10-publication"));

  let consumer = deps?.consumer;
  if (!consumer) {
    // INT-440 / REQ-053 — durable inbound when DATABASE_URL is set (CNPG).
    const store =
      deps?.inboundStore ??
      (env.DATABASE_URL?.trim()
        ? new PgInboundStore(createPgPoolExecutor(env.DATABASE_URL.trim()))
        : new InMemoryInboundStore());
    consumer = new EwdsTopicConsumer<BillingCommandRequest>(
      cgw instanceof CgwClient ? cgw : new CgwClient(loadCgwConfig(env, "ac-10-publication")),
      store,
      {
        fqcn: env.EWDS_COMMAND_FQCN?.trim() || DEFAULT_COMMAND_FQCN,
        topicName: "billingCommandRequest",
        topicOwner:
          env.EWDS_TOPIC_OWNER?.trim() ||
          "integration.apps.intelligent.auth.ewc",
        ...(allowedDids.length > 0 ? { allowedSenders: allowedDids } : {}),
      },
      isBillingCommandRequest,
    );
  }

  return new CommandPoller(
    consumer,
    dispatcher,
    cgw,
    processed,
    {
      replyFqcn: env.EWDS_REPLY_FQCN?.trim() || DEFAULT_REPLY_FQCN,
      pollMs: Number(env.EWDS_COMMAND_POLL_MS ?? DEFAULT_POLL_MS) || DEFAULT_POLL_MS,
      topicOwner: env.EWDS_TOPIC_OWNER?.trim(),
    },
    true,
  );
}

function isBillingCommandRequest(x: unknown): x is BillingCommandRequest {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.requestId === "string" &&
    typeof o.operation === "string" &&
    typeof o.actorId === "string" &&
    typeof o.payload === "object" &&
    o.payload !== null
  );
}
