/**
 * INT-441 — REQ-052 command-channel use-case fixtures for the Mock CGW.
 *
 * Each scenario builds a schema-valid request (Project UI → CGW) and a
 * schema-valid success reply (BPS → CGW) so tests assert the wire contract
 * without EWAG or a live BPS process.
 */
import { randomUUID } from "node:crypto";

export type CommandOperation =
  | "startPayment"
  | "requestWithdrawal"
  | "setInvoiceStatus"
  | "startKyc"
  | "sendReminder"
  | "triggerBillingRun"
  | "setupPaymentMethod";

export type CommandScenario = {
  operation: CommandOperation;
  /** Injected on the request FQCN (UI → BPS). */
  request: {
    requestId: string;
    operation: CommandOperation;
    actorId: string;
    payload: Record<string, unknown>;
  };
  /** Posted on the reply FQCN (BPS → UI). */
  reply: {
    requestId: string;
    operation: CommandOperation;
    success: true;
    data: Record<string, unknown>;
  };
};

const ACTOR = "11111111-2222-4333-8444-555555555555";
const INVOICE = "3f1c2a9e-8b7d-4c21-9a0e-5d6f7a8b9c01";
const COMMUNITY = "c0ffee00-1234-4abc-8def-0123456789ab";
const RETURN = "https://ui.intelligent-project.eu/billing/return";

function handoffHosted(
  purpose: "checkout" | "connect_onboarding" | "setup" | "identity",
) {
  // Map A7-bis purpose → Stripe hosted host (schema pattern).
  const host =
    purpose === "checkout"
      ? "checkout"
      : purpose === "identity"
        ? "verify"
        : "connect";
  return {
    surface: "hosted" as const,
    provider: "stripe" as const,
    purpose,
    url: `https://${host}.stripe.com/c/pay/cs_test_mock`,
    expiresAt: "2026-11-25T20:00:00.000Z",
  };
}

function handoffEmbedded(
  purpose: "payment" | "setup" | "connect_onboarding" | "identity",
) {
  return {
    surface: "embedded" as const,
    provider: "stripe" as const,
    purpose,
    publishableKey: "pk_test_mockCgwHarness000000000000",
    clientSecret: "pi_mock_secret_cgw_harness",
    connectedAccountRef: "acct_mockCgw",
    expiresAt: "2026-11-25T20:00:00.000Z",
  };
}

/** All contracted command operations with happy-path request + reply. */
export function commandChannelScenarios(): CommandScenario[] {
  const paymentId = randomUUID();
  const requestIdPayment = randomUUID();
  const requestIdWithdraw = randomUUID();
  const requestIdStatus = randomUUID();
  const requestIdKyc = randomUUID();
  const requestIdReminder = randomUUID();
  const requestIdRun = randomUUID();
  const requestIdSetup = randomUUID();

  return [
    {
      operation: "startPayment",
      request: {
        requestId: requestIdPayment,
        operation: "startPayment",
        actorId: ACTOR,
        payload: {
          invoiceId: INVOICE,
          surface: "hosted",
          returnUrl: RETURN,
        },
      },
      reply: {
        requestId: requestIdPayment,
        operation: "startPayment",
        success: true,
        data: {
          paymentId,
          status: "requires_action",
          handoff: handoffHosted("checkout"),
        },
      },
    },
    {
      operation: "requestWithdrawal",
      request: {
        requestId: requestIdWithdraw,
        operation: "requestWithdrawal",
        actorId: ACTOR,
        // Contract: currency only (period is chosen server-side / withdrawable list).
        payload: { currency: "EUR" },
      },
      reply: {
        requestId: requestIdWithdraw,
        operation: "requestWithdrawal",
        success: true,
        data: {
          payoutId: randomUUID(),
          status: "in_transit",
          period: "2026-11",
        },
      },
    },
    {
      operation: "setInvoiceStatus",
      request: {
        requestId: requestIdStatus,
        operation: "setInvoiceStatus",
        actorId: ACTOR,
        payload: {
          invoiceId: INVOICE,
          status: "Void",
          reason: "Mock CGW harness",
        },
      },
      reply: {
        requestId: requestIdStatus,
        operation: "setInvoiceStatus",
        success: true,
        data: { invoiceId: INVOICE, status: "Void" },
      },
    },
    {
      operation: "startKyc",
      request: {
        requestId: requestIdKyc,
        operation: "startKyc",
        actorId: ACTOR,
        payload: { surface: "embedded" },
      },
      reply: {
        requestId: requestIdKyc,
        operation: "startKyc",
        success: true,
        data: handoffEmbedded("identity"),
      },
    },
    {
      operation: "sendReminder",
      request: {
        requestId: requestIdReminder,
        operation: "sendReminder",
        actorId: ACTOR,
        payload: { invoiceId: INVOICE },
      },
      reply: {
        requestId: requestIdReminder,
        operation: "sendReminder",
        success: true,
        data: { invoiceId: INVOICE, reminderCount: 1 },
      },
    },
    {
      operation: "triggerBillingRun",
      request: {
        requestId: requestIdRun,
        operation: "triggerBillingRun",
        actorId: ACTOR,
        payload: {
          communityId: COMMUNITY,
          type: "final",
          period: "2026-11",
        },
      },
      reply: {
        requestId: requestIdRun,
        operation: "triggerBillingRun",
        success: true,
        data: { runId: randomUUID(), status: "queued" },
      },
    },
    {
      operation: "setupPaymentMethod",
      request: {
        requestId: requestIdSetup,
        operation: "setupPaymentMethod",
        actorId: ACTOR,
        payload: { surface: "hosted", returnUrl: RETURN },
      },
      reply: {
        requestId: requestIdSetup,
        operation: "setupPaymentMethod",
        success: true,
        data: { handoff: handoffHosted("setup") },
      },
    },
  ];
}

/** Default FQCNs used by AC-10 command poller (overridable via env in prod). */
export const MOCK_CGW_COMMAND_FQCN = "billing.commands.sub";
export const MOCK_CGW_REPLY_FQCN = "billing.replies.pub";
export const MOCK_CGW_TOPIC_OWNER = "integration.apps.intelligent.auth.ewc";
