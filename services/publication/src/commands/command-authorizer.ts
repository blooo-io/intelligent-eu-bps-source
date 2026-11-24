import type {
  ActorAuthzView,
  AuthzDecision,
  AuthzRole,
  BillingCommandOperation,
  BillingCommandRequest,
  InvoiceAuthzView,
} from "./billing-command.types.js";
import type { ActorAuthzClient } from "./participants-authz.client.js";
import type { InvoiceLookupClient } from "./invoice-lookup.client.js";

type PolicyCtx = {
  req: BillingCommandRequest;
  authz: ActorAuthzView;
  invoice: InvoiceAuthzView | null;
};

type PolicyFn = (ctx: PolicyCtx) => AuthzDecision;

/**
 * REQ-052 (A7) / REQ-049 / REQ-044 / NFR-015 — EWDS command authorization.
 *
 * Layer 2: senderDid ∈ allowedDids ∧ signatureValid.
 * Layer 3: actor role policy per operation (see table in plan Task 4.15).
 */
export class CommandAuthorizer {
  private readonly policies: Record<BillingCommandOperation, PolicyFn>;

  constructor(
    private readonly allowedDids: string[],
    private readonly authz: ActorAuthzClient,
    private readonly invoices: InvoiceLookupClient,
  ) {
    this.policies = {
      startPayment: policyStartPayment,
      requestWithdrawal: policyRequestWithdrawal,
      setInvoiceStatus: policyManagerOfInvoiceCommunity,
      startKyc: policyStartKyc,
      sendReminder: policyManagerOfInvoiceCommunity,
      triggerBillingRun: policyTriggerBillingRun,
      setupPaymentMethod: policySetupPaymentMethod,
    };
  }

  async decide(
    senderDid: string,
    signatureValid: boolean,
    req: BillingCommandRequest,
  ): Promise<AuthzDecision> {
    // A7 / REQ-052 — Layer 2: DID allow-list + signature (no internal call).
    if (!signatureValid || !this.allowedDids.includes(senderDid)) {
      return { allow: false, code: "forbidden" };
    }

    const authz = await this.authz.getAuthorization(req.actorId);
    if (authz.status !== "active") {
      return { allow: false, code: "forbidden" };
    }

    const invoiceId = asString(req.payload.invoiceId);
    let invoice: InvoiceAuthzView | null = null;
    if (invoiceId) {
      invoice = await this.invoices.getInvoice(invoiceId);
      if (!invoice) {
        return { allow: false, code: "not_found" };
      }
    }

    const policy = this.policies[req.operation];
    if (!policy) {
      return { allow: false, code: "forbidden" };
    }
    return policy({ req, authz, invoice });
  }
}

/** REQ-014 / REQ-049 — member pays only invoices issued to them. */
function policyStartPayment(ctx: PolicyCtx): AuthzDecision {
  if (!ctx.invoice) return { allow: false, code: "not_found" };
  const member = findMembership(ctx.authz, ctx.invoice.communityId, "member");
  if (!member) return { allow: false, code: "forbidden" };
  if (ctx.req.actorId !== ctx.invoice.invoiceIssuedTo) {
    return { allow: false, code: "forbidden" };
  }
  return {
    allow: true,
    communityId: ctx.invoice.communityId,
    role: "member",
  };
}

/** REQ-015 / REQ-049 — producer/prosumer member may request withdrawal. */
function policyRequestWithdrawal(ctx: PolicyCtx): AuthzDecision {
  const member = ctx.authz.memberships.find((m) => m.role === "member");
  if (!member) return { allow: false, code: "forbidden" };
  if (
    member.participantRole !== "producer" &&
    member.participantRole !== "prosumer"
  ) {
    return { allow: false, code: "forbidden" };
  }
  return {
    allow: true,
    communityId: member.communityId,
    role: "member",
  };
}

/** REQ-049 — manager of the invoice's community. */
function policyManagerOfInvoiceCommunity(ctx: PolicyCtx): AuthzDecision {
  if (!ctx.invoice) return { allow: false, code: "not_found" };
  const manager = findMembership(ctx.authz, ctx.invoice.communityId, "manager");
  if (!manager) return { allow: false, code: "forbidden" };
  return {
    allow: true,
    communityId: ctx.invoice.communityId,
    role: "manager",
  };
}

/**
 * REQ-045 / REQ-049 — member → connect_account; manager → identity.
 * Both roles are allowed; dispatcher picks the KYC kind from `role`.
 */
function policyStartKyc(ctx: PolicyCtx): AuthzDecision {
  const manager = ctx.authz.memberships.find((m) => m.role === "manager");
  if (manager) {
    return {
      allow: true,
      communityId: manager.communityId,
      role: "manager",
    };
  }
  const member = ctx.authz.memberships.find((m) => m.role === "member");
  if (member) {
    return {
      allow: true,
      communityId: member.communityId,
      role: "member",
    };
  }
  return { allow: false, code: "forbidden" };
}

/** REQ-044 / REQ-049 — manager of payload.communityId, or operator. */
function policyTriggerBillingRun(ctx: PolicyCtx): AuthzDecision {
  const communityId = asString(ctx.req.payload.communityId);
  if (!communityId) return { allow: false, code: "forbidden" };

  if (hasOperator(ctx.authz)) {
    return { allow: true, communityId, role: "operator" };
  }
  const manager = findMembership(ctx.authz, communityId, "manager");
  if (!manager) return { allow: false, code: "forbidden" };
  return { allow: true, communityId, role: "manager" };
}

/** A7-bis — member may set up a payment method for themselves. */
function policySetupPaymentMethod(ctx: PolicyCtx): AuthzDecision {
  const member = ctx.authz.memberships.find((m) => m.role === "member");
  if (!member) return { allow: false, code: "forbidden" };
  return {
    allow: true,
    communityId: member.communityId,
    role: "member",
  };
}

function findMembership(
  authz: ActorAuthzView,
  communityId: string,
  role: AuthzRole,
) {
  return authz.memberships.find(
    (m) => m.communityId === communityId && m.role === role,
  );
}

function hasOperator(authz: ActorAuthzView): boolean {
  return authz.memberships.some((m) => m.role === "operator");
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function parseAllowedCommandDids(
  raw: string | undefined,
): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
