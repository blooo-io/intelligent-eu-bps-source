import { createTopicValidator } from "@intelligent/ewds-client";
import type { OutboxService } from "@intelligent/module-template";
import type { CommandAuthorizer } from "./command-authorizer.js";
import type {
  AuthzDecision,
  BillingCommandErrorCode,
  BillingCommandOperation,
  BillingCommandReply,
  BillingCommandRequest,
  PspHandoff,
} from "./billing-command.types.js";
import { STRIPE_HOSTED_URL_RE } from "./billing-command.types.js";
import {
  CommandTargetError,
  type CommandTargetsPort,
} from "./command-targets.client.js";
import type { ProcessedCommandsStore } from "./processed-commands.store.js";

const PRODUCER = "ac-10-publication";
const RATE_LIMIT_PER_MIN = 30;
const RATE_WINDOW_MS = 60_000;

const validateRequest = createTopicValidator("billingCommandRequest");
const validateReply = createTopicValidator("billingCommandReply");

export type CommandInboundMessage = {
  messageId: string;
  sender: string;
  signatureValid: boolean;
  body: BillingCommandRequest;
};

/**
 * REQ-052 (A7) / REQ-014 / REQ-015 / REQ-051 / REQ-044 / REQ-061 / REQ-006 / REQ-030
 * — authorize, dispatch to internal targets, reply with Stripe-hosted handoffs only.
 */
export class CommandDispatcher {
  private readonly rateBuckets = new Map<string, number[]>();

  constructor(
    private readonly authz: CommandAuthorizer,
    private readonly targets: CommandTargetsPort,
    private readonly processed: ProcessedCommandsStore,
    private readonly returnUrlPrefixes: string[],
    private readonly outbox: OutboxService,
    private readonly allowedDids: string[],
  ) {}

  /**
   * @returns reply envelope, or `null` when layer-2 fails (unknown DID / bad signature — drop, no reply).
   */
  async handle(msg: CommandInboundMessage): Promise<BillingCommandReply | null> {
    // A7 — Layer 2: unknown DID or invalid signature → drop (no reply).
    if (
      !msg.signatureValid ||
      !this.allowedDids.includes(msg.sender)
    ) {
      return null;
    }

    const bodyCheck = validateRequest(msg.body);
    if (!bodyCheck.ok) {
      const requestId =
        typeof msg.body?.requestId === "string" ? msg.body.requestId : "";
      const operation = (msg.body?.operation ??
        "startPayment") as BillingCommandOperation;
      if (!requestId) return null;
      return errorReply(requestId, operation, "invalid", "invalid request");
    }

    const req = msg.body;
    const cached = await this.processed.get(req.requestId);
    if (cached) return cached;

    if (!this.allowRate(msg.sender)) {
      await this.outbox.append({
        aggregateType: "EwdsCommand",
        aggregateId: req.requestId,
        type: "AuditableActionPerformed",
        producer: PRODUCER,
        communityId: "00000000-0000-4000-8000-000000000000",
        billingMode: "virtual",
        data: {
          actorId: req.actorId,
          action: "ewds.rate_limit",
          target: `senderDid:${msg.sender}`,
          senderDid: msg.sender,
          timestamp: new Date().toISOString(),
        },
      });
      return this.storeAndReturn(
        errorReply(
          req.requestId,
          req.operation,
          "unavailable",
          "rate limit exceeded",
        ),
      );
    }

    const decision = await this.authz.decide(
      msg.sender,
      msg.signatureValid,
      req,
    );
    if (!decision.allow) {
      return this.storeAndReturn(
        errorReply(req.requestId, req.operation, decision.code, decision.code),
      );
    }

    const returnUrlError = this.checkReturnUrls(req);
    if (returnUrlError) {
      return this.storeAndReturn(returnUrlError);
    }

    let reply: BillingCommandReply;
    try {
      reply = await this.dispatch(req, decision);
    } catch (err) {
      reply = mapTargetError(req, err);
    }

    const replyCheck = validateReply(reply);
    if (!replyCheck.ok) {
      reply = errorReply(
        req.requestId,
        req.operation,
        "unavailable",
        "invalid reply",
      );
    }

    await this.outbox.append({
      aggregateType: "EwdsCommand",
      aggregateId: req.requestId,
      type: "AuditableActionPerformed",
      producer: PRODUCER,
      communityId: decision.communityId,
      billingMode: "virtual",
      data: {
        actorId: req.actorId,
        action: `ewds.${req.operation}`,
        target: auditTarget(req),
        senderDid: msg.sender,
        timestamp: new Date().toISOString(),
      },
    });

    return this.storeAndReturn(reply);
  }

  private async storeAndReturn(
    reply: BillingCommandReply,
  ): Promise<BillingCommandReply> {
    await this.processed.put(reply.requestId, reply);
    return reply;
  }

  private allowRate(senderDid: string): boolean {
    const now = Date.now();
    const prev = this.rateBuckets.get(senderDid) ?? [];
    const recent = prev.filter((t) => now - t < RATE_WINDOW_MS);
    if (recent.length >= RATE_LIMIT_PER_MIN) {
      this.rateBuckets.set(senderDid, recent);
      return false;
    }
    recent.push(now);
    this.rateBuckets.set(senderDid, recent);
    return true;
  }

  private checkReturnUrls(
    req: BillingCommandRequest,
  ): BillingCommandReply | null {
    const urls = [
      asString(req.payload.returnUrl),
      asString(req.payload.refreshUrl),
    ].filter((u): u is string => Boolean(u));
    if (urls.length === 0) return null;
    for (const url of urls) {
      if (!this.returnUrlPrefixes.some((p) => url.startsWith(p))) {
        return errorReply(
          req.requestId,
          req.operation,
          "invalid",
          "returnUrl not allowed",
        );
      }
    }
    return null;
  }

  private async dispatch(
    req: BillingCommandRequest,
    decision: Extract<AuthzDecision, { allow: true }>,
  ): Promise<BillingCommandReply> {
    switch (req.operation) {
      case "startPayment":
        return this.doStartPayment(req);
      case "requestWithdrawal":
        return this.doRequestWithdrawal(req);
      case "startKyc":
        return this.doStartKyc(req, decision);
      case "setInvoiceStatus":
        return this.doSetInvoiceStatus(req, decision);
      case "sendReminder":
        return this.doSendReminder(req, decision);
      case "triggerBillingRun":
        return this.doStartRun(req, decision);
      case "setupPaymentMethod":
        return this.doSetupPaymentMethod(req);
      default:
        return errorReply(
          req.requestId,
          req.operation,
          "forbidden",
          "unknown operation",
        );
    }
  }

  private async doStartPayment(
    req: BillingCommandRequest,
  ): Promise<BillingCommandReply> {
    const invoiceId = requireString(req.payload.invoiceId, "invoiceId");
    const surface = (asString(req.payload.surface) ?? "hosted") as
      | "hosted"
      | "embedded";
    const returnUrl = asString(req.payload.returnUrl);
    const result = await this.targets.startPayment({
      invoiceId,
      actorId: req.actorId,
      surface,
      ...(returnUrl ? { returnUrl } : {}),
    });
    if (result.handoff) assertStripeHandoff(result.handoff);
    return {
      requestId: req.requestId,
      operation: "startPayment",
      success: true,
      data: {
        paymentId: result.paymentId,
        status: result.status,
        ...(result.handoff ? { handoff: result.handoff } : {}),
      },
    };
  }

  private async doRequestWithdrawal(
    req: BillingCommandRequest,
  ): Promise<BillingCommandReply> {
    const currency = requireString(req.payload.currency, "currency");
    const result = await this.targets.requestWithdrawal({
      actorId: req.actorId,
      currency,
    });
    return {
      requestId: req.requestId,
      operation: "requestWithdrawal",
      success: true,
      data: { ...result },
    };
  }

  private async doStartKyc(
    req: BillingCommandRequest,
    decision: Extract<AuthzDecision, { allow: true }>,
  ): Promise<BillingCommandReply> {
    const surface = (asString(req.payload.surface) ?? "hosted") as
      | "hosted"
      | "embedded";
    const kind =
      decision.role === "manager" ? "identity" : "connect_account";
    const returnUrl = asString(req.payload.returnUrl);
    const refreshUrl = asString(req.payload.refreshUrl);
    const handoff = await this.targets.startKyc({
      actorId: req.actorId,
      kind,
      surface,
      ...(returnUrl ? { returnUrl } : {}),
      ...(refreshUrl ? { refreshUrl } : {}),
    });
    assertStripeHandoff(handoff);
    return {
      requestId: req.requestId,
      operation: "startKyc",
      success: true,
      data: handoff as unknown as Record<string, unknown>,
    };
  }

  private async doSetInvoiceStatus(
    req: BillingCommandRequest,
    decision: Extract<AuthzDecision, { allow: true }>,
  ): Promise<BillingCommandReply> {
    const invoiceId = requireString(req.payload.invoiceId, "invoiceId");
    const status = requireString(req.payload.status, "status");
    const reason = requireString(req.payload.reason, "reason");
    const result = await this.targets.setInvoiceStatus({
      invoiceId,
      status,
      reason,
      actorId: req.actorId,
      communityId: decision.communityId,
    });
    return {
      requestId: req.requestId,
      operation: "setInvoiceStatus",
      success: true,
      data: { ...result },
    };
  }

  private async doSendReminder(
    req: BillingCommandRequest,
    decision: Extract<AuthzDecision, { allow: true }>,
  ): Promise<BillingCommandReply> {
    const invoiceId = requireString(req.payload.invoiceId, "invoiceId");
    const result = await this.targets.sendReminder({
      invoiceId,
      actorId: req.actorId,
      communityId: decision.communityId,
    });
    return {
      requestId: req.requestId,
      operation: "sendReminder",
      success: true,
      data: { ...result },
    };
  }

  private async doStartRun(
    req: BillingCommandRequest,
    decision: Extract<AuthzDecision, { allow: true }>,
  ): Promise<BillingCommandReply> {
    const period = requireString(req.payload.period, "period");
    const type = requireString(req.payload.type, "type") as
      | "periodic"
      | "final";
    const result = await this.targets.startRun({
      communityId: decision.communityId,
      type,
      period,
    });
    return {
      requestId: req.requestId,
      operation: "triggerBillingRun",
      success: true,
      data: { ...result },
    };
  }

  private async doSetupPaymentMethod(
    req: BillingCommandRequest,
  ): Promise<BillingCommandReply> {
    const surface = (asString(req.payload.surface) ?? "hosted") as
      | "hosted"
      | "embedded";
    const returnUrl = asString(req.payload.returnUrl);
    const result = await this.targets.setupPaymentMethod({
      actorId: req.actorId,
      surface,
      ...(returnUrl ? { returnUrl } : {}),
    });
    assertStripeHandoff(result.handoff);
    return {
      requestId: req.requestId,
      operation: "setupPaymentMethod",
      success: true,
      data: { handoff: result.handoff },
    };
  }
}

function assertStripeHandoff(handoff: PspHandoff): void {
  if (handoff.surface === "hosted") {
    if (!STRIPE_HOSTED_URL_RE.test(handoff.url)) {
      throw new CommandTargetError(
        502,
        "unavailable",
        "non-Stripe redirect refused",
      );
    }
  }
}

function mapTargetError(
  req: BillingCommandRequest,
  err: unknown,
): BillingCommandReply {
  if (err instanceof CommandTargetError) {
    return errorReply(req.requestId, req.operation, err.code, err.message);
  }
  if (err instanceof Error && /required/.test(err.message)) {
    return errorReply(req.requestId, req.operation, "invalid", err.message);
  }
  return errorReply(
    req.requestId,
    req.operation,
    "unavailable",
    "target failed",
  );
}

function errorReply(
  requestId: string,
  operation: BillingCommandOperation,
  code: BillingCommandErrorCode,
  message: string,
): BillingCommandReply {
  // NFR-002 — identifiers / codes only; never PII in error.message.
  return {
    requestId,
    operation,
    success: false,
    error: { code, message: sanitizeMessage(message) },
  };
}

function sanitizeMessage(message: string): string {
  // Strip anything that looks like an email or phone.
  return message
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted]")
    .replace(/\+?\d[\d\s()-]{6,}\d/g, "[redacted]")
    .slice(0, 200);
}

function auditTarget(req: BillingCommandRequest): string {
  const invoiceId = asString(req.payload.invoiceId);
  if (invoiceId) return `invoice:${invoiceId}`;
  const communityId = asString(req.payload.communityId);
  if (communityId) return `community:${communityId}`;
  return `actor:${req.actorId}`;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function requireString(value: unknown, field: string): string {
  const s = asString(value);
  if (!s) throw new Error(`${field} required`);
  return s;
}
