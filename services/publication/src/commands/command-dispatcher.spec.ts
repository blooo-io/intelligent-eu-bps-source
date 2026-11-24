import { describe, expect, it, vi } from "vitest";
import {
  InMemoryOutboxStore,
  OutboxService,
} from "@intelligent/module-template";
import { CommandAuthorizer } from "./command-authorizer.js";
import { CommandDispatcher } from "./command-dispatcher.js";
import type {
  ActorAuthzView,
  BillingCommandRequest,
  InvoiceAuthzView,
  PspHandoff,
} from "./billing-command.types.js";
import {
  CommandTargetError,
  type CommandTargetsPort,
} from "./command-targets.client.js";
import { InMemoryProcessedCommandsStore } from "./processed-commands.store.js";
import { StubActorAuthzClient } from "./participants-authz.client.js";
import { StubInvoiceLookupClient } from "./invoice-lookup.client.js";

const ALLOWED = "did:ethr:0xUI";
const RETURN_PREFIX = "https://ui.intelligent-project.eu/";
const C1 = "a1000000-0000-4000-8000-000000000001";
const ACTOR = "11111111-2222-4333-8444-555555555555";
const INV = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const PAYMENT_ID = "9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a";
const REQUEST_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

describe("CommandDispatcher (REQ-052 / A7 / A7-bis)", () => {
  it("A7 REQ-014: startPayment replies with the Stripe Checkout handoff", async () => {
    const { d, targets } = harness();
    targets.startPayment = vi.fn(async () => ({
      paymentId: PAYMENT_ID,
      status: "requires_action" as const,
      handoff: hostedCheckout(),
    }));
    const r = await d.handle(
      msg(
        "startPayment",
        {
          invoiceId: INV,
          surface: "hosted",
          returnUrl: `${RETURN_PREFIX}billing/return`,
        },
        REQUEST_ID,
      ),
    );
    expect(r).toEqual({
      requestId: REQUEST_ID,
      operation: "startPayment",
      success: true,
      data: {
        paymentId: PAYMENT_ID,
        status: "requires_action",
        handoff: hostedCheckout(),
      },
    });
  });

  it("A7: a target returning a non-Stripe URL yields error unavailable (never forwards a Blooo URL)", async () => {
    const { d, targets } = harness();
    targets.startPayment = vi.fn(async () => ({
      paymentId: PAYMENT_ID,
      status: "requires_action" as const,
      handoff: {
        ...hostedCheckout(),
        url: "https://app.dev.intelligent-eu-bp.blooo.dev/pay",
      },
    }));
    const r = await d.handle(
      msg("startPayment", {
        invoiceId: INV,
        surface: "hosted",
        returnUrl: `${RETURN_PREFIX}billing/return`,
      }),
    );
    expect(r?.success).toBe(false);
    expect(r?.error?.code).toBe("unavailable");
    expect(JSON.stringify(r)).not.toContain("blooo.dev");
  });

  it("A7: returnUrl outside EWDS_COMMAND_RETURN_URL_PREFIXES -> invalid, target not called", async () => {
    const { d, targets } = harness();
    targets.startPayment = vi.fn();
    const r = await d.handle(
      msg("startPayment", {
        invoiceId: INV,
        surface: "hosted",
        returnUrl: "https://evil.example/return",
      }),
    );
    expect(r).toMatchObject({
      success: false,
      error: { code: "invalid" },
    });
    expect(targets.startPayment).not.toHaveBeenCalled();
  });

  it("idempotent: same requestId twice -> same reply, target called once", async () => {
    const { d, targets } = harness();
    targets.startPayment = vi.fn(async () => ({
      paymentId: PAYMENT_ID,
      status: "requires_action" as const,
      handoff: hostedCheckout(),
    }));
    const m = msg(
      "startPayment",
      {
        invoiceId: INV,
        surface: "hosted",
        returnUrl: `${RETURN_PREFIX}billing/return`,
      },
      REQUEST_ID,
    );
    const r1 = await d.handle(m);
    const r2 = await d.handle(m);
    expect(r1).toEqual(r2);
    expect(targets.startPayment).toHaveBeenCalledTimes(1);
  });

  it("REQ-044: setInvoiceStatus passes reason and actorId and communityId from authz", async () => {
    const { d, targets, authzClient, invoices } = harness({ role: "manager" });
    authzClient.set(activeManager(ACTOR, C1));
    invoices.set(invoice(INV, C1, ACTOR));
    targets.setInvoiceStatus = vi.fn(async (i) => ({
      invoiceId: i.invoiceId,
      invoiceStatus: i.status,
    }));
    const r = await d.handle(
      msg("setInvoiceStatus", {
        invoiceId: INV,
        status: "Void",
        reason: "duplicate billing",
      }),
    );
    expect(r?.success).toBe(true);
    expect(targets.setInvoiceStatus).toHaveBeenCalledWith({
      invoiceId: INV,
      status: "Void",
      reason: "duplicate billing",
      actorId: ACTOR,
      communityId: C1,
    });
  });

  it("REQ-030: every allowed command appends AuditableActionPerformed {actorId, action:'ewds.<op>', target, senderDid}", async () => {
    const { d, targets, outboxStore } = harness();
    targets.startPayment = vi.fn(async () => ({
      paymentId: PAYMENT_ID,
      status: "requires_action" as const,
      handoff: hostedCheckout(),
    }));
    await d.handle(
      msg("startPayment", {
        invoiceId: INV,
        surface: "hosted",
        returnUrl: `${RETURN_PREFIX}billing/return`,
      }),
    );
    const events = (await outboxStore.list()).map((row) => row.event);
    const audit = events.find((e) => e.type === "AuditableActionPerformed");
    expect(audit?.data).toMatchObject({
      actorId: ACTOR,
      action: "ewds.startPayment",
      target: `invoice:${INV}`,
      senderDid: ALLOWED,
    });
  });

  it("unknown DID -> returns null (dropped, no reply)", async () => {
    const { d, targets } = harness();
    targets.startPayment = vi.fn();
    const r = await d.handle({
      ...msg("startPayment", {
        invoiceId: INV,
        surface: "hosted",
        returnUrl: `${RETURN_PREFIX}billing/return`,
      }),
      sender: "did:ethr:0xEVIL",
    });
    expect(r).toBeNull();
    expect(targets.startPayment).not.toHaveBeenCalled();
  });

  it("target 404 -> not_found; 409 -> conflict; 5xx/timeout -> unavailable; message has no PII", async () => {
    const { d, targets } = harness();
    targets.startPayment = vi.fn(async () => {
      throw new CommandTargetError(404, "not_found");
    });
    const r404 = await d.handle(
      msg(
        "startPayment",
        {
          invoiceId: INV,
          surface: "hosted",
          returnUrl: `${RETURN_PREFIX}billing/return`,
        },
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      ),
    );
    expect(r404?.error?.code).toBe("not_found");

    targets.startPayment = vi.fn(async () => {
      throw new CommandTargetError(409, "conflict");
    });
    const r409 = await d.handle(
      msg(
        "startPayment",
        {
          invoiceId: INV,
          surface: "hosted",
          returnUrl: `${RETURN_PREFIX}billing/return`,
        },
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      ),
    );
    expect(r409?.error?.code).toBe("conflict");

    targets.startPayment = vi.fn(async () => {
      throw new CommandTargetError(
        503,
        "unavailable",
        "upstream alice@example.invalid failed",
      );
    });
    const r5xx = await d.handle(
      msg(
        "startPayment",
        {
          invoiceId: INV,
          surface: "hosted",
          returnUrl: `${RETURN_PREFIX}billing/return`,
        },
        "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      ),
    );
    expect(r5xx?.error?.code).toBe("unavailable");
    expect(r5xx?.error?.message).not.toContain("alice@example.invalid");
  });

  it("A7-bis: startPayment surface=embedded replies with clientSecret, publishableKey and connectedAccountRef", async () => {
    const { d, targets } = harness();
    const handoff: PspHandoff = {
      surface: "embedded",
      provider: "stripe",
      purpose: "payment",
      publishableKey: "pk_test_abc12345",
      clientSecret: "pi_secret_abcdef",
      connectedAccountRef: "acct_1234567890",
      expiresAt: "2026-11-24T10:30:00Z",
    };
    targets.startPayment = vi.fn(async () => ({
      paymentId: PAYMENT_ID,
      status: "requires_action" as const,
      handoff,
    }));
    const r = await d.handle(
      msg("startPayment", { invoiceId: INV, surface: "embedded" }),
    );
    expect(r?.success).toBe(true);
    expect(r?.data).toMatchObject({
      paymentId: PAYMENT_ID,
      handoff,
    });
  });

  it("A7-bis: startKyc surface=hosted replies with a connect.stripe.com URL", async () => {
    const { d, targets } = harness();
    targets.startKyc = vi.fn(async () => ({
      surface: "hosted" as const,
      provider: "stripe" as const,
      purpose: "connect_onboarding" as const,
      url: "https://connect.stripe.com/setup/s/test_abc",
      expiresAt: "2026-11-24T10:30:00Z",
    }));
    const r = await d.handle(
      msg("startKyc", {
        surface: "hosted",
        returnUrl: `${RETURN_PREFIX}kyc/return`,
      }),
    );
    expect(r?.success).toBe(true);
    expect(r?.data).toMatchObject({
      surface: "hosted",
      purpose: "connect_onboarding",
      url: "https://connect.stripe.com/setup/s/test_abc",
    });
  });

  it("per-sender rate limit: more than 30 commands/min from one DID -> error unavailable and an operator alert event", async () => {
    const { d, targets, outboxStore } = harness();
    targets.startPayment = vi.fn(async () => ({
      paymentId: PAYMENT_ID,
      status: "requires_action" as const,
      handoff: hostedCheckout(),
    }));
    for (let i = 0; i < 30; i += 1) {
      const id = `f47ac10b-58cc-4372-a567-${String(i).padStart(12, "0")}`;
      const r = await d.handle(
        msg(
          "startPayment",
          {
            invoiceId: INV,
            surface: "hosted",
            returnUrl: `${RETURN_PREFIX}billing/return`,
          },
          id,
        ),
      );
      expect(r?.success).toBe(true);
    }
    const blocked = await d.handle(
      msg(
        "startPayment",
        {
          invoiceId: INV,
          surface: "hosted",
          returnUrl: `${RETURN_PREFIX}billing/return`,
        },
        "f47ac10b-58cc-4372-a567-000000000099",
      ),
    );
    expect(blocked?.error?.code).toBe("unavailable");
    const alert = (await outboxStore.list())
      .map((row) => row.event)
      .find(
        (e) =>
          e.type === "AuditableActionPerformed" &&
          e.data.action === "ewds.rate_limit",
      );
    expect(alert).toBeDefined();
  });
});

function harness(opts?: { role?: "member" | "manager" }) {
  const authzClient = new StubActorAuthzClient();
  const invoices = new StubInvoiceLookupClient();
  invoices.set(invoice(INV, C1, ACTOR));
  if (opts?.role === "manager") {
    authzClient.set(activeManager(ACTOR, C1));
  } else {
    authzClient.set(activeMember(ACTOR, C1));
  }
  const authorizer = new CommandAuthorizer(
    [ALLOWED],
    authzClient,
    invoices,
  );
  const targets = stubTargets();
  const processed = new InMemoryProcessedCommandsStore();
  const outboxStore = new InMemoryOutboxStore();
  const outbox = new OutboxService(outboxStore);
  const d = new CommandDispatcher(
    authorizer,
    targets,
    processed,
    [RETURN_PREFIX],
    outbox,
    [ALLOWED],
  );
  return { d, targets, authzClient, invoices, outboxStore, processed };
}

function stubTargets(): CommandTargetsPort {
  return {
    startPayment: async () => {
      throw new Error("not stubbed");
    },
    requestWithdrawal: async () => {
      throw new Error("not stubbed");
    },
    startKyc: async () => {
      throw new Error("not stubbed");
    },
    setInvoiceStatus: async () => {
      throw new Error("not stubbed");
    },
    sendReminder: async () => {
      throw new Error("not stubbed");
    },
    startRun: async () => {
      throw new Error("not stubbed");
    },
    setupPaymentMethod: async () => {
      throw new Error("not stubbed");
    },
  };
}

function msg(
  operation: BillingCommandRequest["operation"],
  payload: Record<string, unknown>,
  requestId = REQUEST_ID,
) {
  return {
    messageId: "m1",
    sender: ALLOWED,
    signatureValid: true,
    body: {
      requestId,
      operation,
      actorId: ACTOR,
      payload,
    } satisfies BillingCommandRequest,
  };
}

function hostedCheckout(): PspHandoff {
  return {
    surface: "hosted",
    provider: "stripe",
    purpose: "checkout",
    url: "https://checkout.stripe.com/c/pay/cs_test_1",
    expiresAt: "2026-11-24T10:30:00Z",
  };
}

function invoice(
  invoiceId: string,
  communityId: string,
  issuedTo: string,
): InvoiceAuthzView {
  return {
    invoiceId,
    communityId,
    invoiceIssuedTo: issuedTo,
    invoiceIssuedBy: "66666666-7777-4888-9999-aaaaaaaaaaaa",
  };
}

function activeMember(actorId: string, communityId: string): ActorAuthzView {
  return {
    actorId,
    status: "active",
    memberships: [
      { communityId, role: "member", participantRole: "consumer" },
    ],
  };
}

function activeManager(actorId: string, communityId: string): ActorAuthzView {
  return {
    actorId,
    status: "active",
    memberships: [{ communityId, role: "manager" }],
  };
}
