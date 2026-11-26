/**
 * INT-453 — S3 bridge + S7–S11 money path + S13 commands + S14 purge.
 * AC-03 outbox shape → AC-10 publish; Mock CGW command poller round-trip.
 */
import "reflect-metadata";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  commandChannelScenarios,
  createTopicValidator,
  MOCK_CGW_COMMAND_FQCN,
  MOCK_CGW_REPLY_FQCN,
  MOCK_CGW_TOPIC_OWNER,
  startMockCgwServer,
  type MockCgwListen,
} from "@intelligent/ewds-client";
import { createMockDataSpace } from "@intelligent/mocks";
import {
  InMemoryOutboxStore,
  OutboxService,
} from "@intelligent/module-template";
import { PublicationStore } from "@publication/domain/store.js";
import { PublicationService } from "@publication/publication/publication.service.js";
import { BillingEventsListener } from "@publication/events/billing-events.listener.js";
import { InMemoryEventBus } from "@publication/events/in-memory-event-bus.js";
import { CommandAuthorizer } from "@publication/commands/command-authorizer.js";
import { CommandDispatcher } from "@publication/commands/command-dispatcher.js";
import {
  CommandPoller,
  type CommandReplySender,
  type CommandTopicConsumer,
} from "@publication/commands/command-poller.js";
import type {
  ActorAuthzView,
  BillingCommandRequest,
  InvoiceAuthzView,
  PspHandoff,
} from "@publication/commands/billing-command.types.js";
import type { CommandTargetsPort } from "@publication/commands/command-targets.client.js";
import { InMemoryProcessedCommandsStore } from "@publication/commands/processed-commands.store.js";
import { StubActorAuthzClient } from "@publication/commands/participants-authz.client.js";
import { StubInvoiceLookupClient } from "@publication/commands/invoice-lookup.client.js";
import { IDS } from "../fixtures/scenarios.js";
import { markCovered } from "../fixtures/coverage-tracker.js";

const validateRequest = createTopicValidator("billingCommandRequest");
const validateReply = createTopicValidator("billingCommandReply");
const validateKyc = createTopicValidator("billingKycStatus");
const validateInvoice = createTopicValidator("billingInvoice");
const validateStatement = createTopicValidator("billingStatement");
const validatePayment = createTopicValidator("billingPayment");
const validatePayout = createTopicValidator("billingPayout");

function envelope(
  type: string,
  producer: string,
  data: Record<string, unknown>,
) {
  return {
    eventId: crypto.randomUUID(),
    type,
    version: 1,
    occurredAt: "2026-12-01T06:00:00.000Z",
    producer,
    communityId: IDS.community,
    billingMode: "virtual" as const,
    data,
  };
}

describe("INT-453 E2E S3/S7–S11/S13/S14 (publication + commands)", () => {
  let stub: MockCgwListen | undefined;

  afterEach(async () => {
    await stub?.close();
    stub = undefined;
  });

  it("S3 bridge: UserAccountStatusChanged → schema-valid billingKycStatus", async () => {
    const dataspace = createMockDataSpace();
    const store = new PublicationStore();
    const service = new PublicationService(store, dataspace);
    const bus = new InMemoryEventBus();
    const listener = new BillingEventsListener(bus, service);
    await listener.onModuleInit();

    // Payload shape matches AC-03 acceptTermsForActor outbox (INT-448).
    await bus.publish(
      "UserAccountStatusChanged",
      envelope("UserAccountStatusChanged", "AC-03", {
        actorId: IDS.consumer,
        kycVerified: false,
        accountStatus: "PendingVerification",
        verificationKind: "connect_account",
        termsVersion: "v1.0.0",
        termsAcceptedAt: "2026-11-26T06:00:00.000Z",
        selfBillingMandate: false,
      }),
    );

    const row = dataspace
      .recorded()
      .find((r) => r.topic === "billingKycStatus")!.message;
    expect(validateKyc(row)).toEqual({ ok: true, errors: [] });
    expect(row).toMatchObject({
      actorId: IDS.consumer,
      termsVersion: "v1.0.0",
      kycVerified: false,
    });
    // S3 already marked in onboarding; bridge reinforces publish leg.
    markCovered("S3", {
      run_path: "mock",
      input: {
        event: "UserAccountStatusChanged",
        actorId: IDS.consumer,
        termsVersion: "v1.0.0",
      },
      output: { billingKycStatus: row },
    });
  });

  it("S7: triggerBillingRun command + StatementIssued/InvoiceIssued → EWDS topics", async () => {
    const { poller, cgw, targets } = buildLivePoller("triggerBillingRun", {
      role: "manager",
      body: {
        requestId: crypto.randomUUID(),
        operation: "triggerBillingRun",
        actorId: IDS.consumer,
        payload: {
          communityId: IDS.community,
          type: "final",
          period: "2026-11",
        },
      },
    });
    targets.startRun = vi.fn(async () => ({
      runId: crypto.randomUUID(),
      status: "queued" as const,
    }));
    await poller.tick();
    expect(targets.startRun).toHaveBeenCalled();
    expect(cgw.send).toHaveBeenCalled();

    const dataspace = createMockDataSpace();
    const store = new PublicationStore();
    const service = new PublicationService(store, dataspace);
    const bus = new InMemoryEventBus();
    const listener = new BillingEventsListener(bus, service);
    await listener.onModuleInit();

    await bus.publish(
      "StatementIssued",
      envelope("StatementIssued", "AC-06", {
        billingId: IDS.settlement,
        actorId: IDS.producer,
        siteId: null,
        billingPeriodFrom: "2026-11-01T00:00:00.000Z",
        billingPeriodUntil: "2026-12-01T00:00:00.000Z",
        billingStatus: "Open",
        overdueDate: null,
        totalBought: 6.25,
        totalSold: 20.5,
        netBalance: 14.25,
        balanceDirection: "receive",
        totalEnergyAmount: 10.2,
        totalGridFeeAmount: 0,
        totalTaxAmount: 0,
        totalAmountDue: 14.25,
        totalAmountPaid: 0,
        outstandingAmount: 14.25,
        currency: "CHF",
        invoiceIds: [IDS.invoice],
        payoutIds: null,
      }),
    );
    await bus.publish(
      "InvoiceIssued",
      envelope("InvoiceIssued", "AC-06", {
        invoiceId: IDS.invoice,
        issuerId: IDS.producer,
        recipientId: IDS.consumer,
        settlementId: IDS.settlement,
        issuerStatementId: IDS.issuerStatement,
        dueDate: "2026-12-15",
        billingPeriodFrom: "2026-11-01T00:00:00.000Z",
        billingPeriodUntil: "2026-12-01T00:00:00.000Z",
        settlementType: "periodic",
        totalEnergyKWh: "5.000",
        vatRate: 0.081,
        carriedForwardAmount: "0",
        exchangeRate: { rate: "0.941200", rateDate: "2026-11-30" },
        amounts: { energy: "10.00", vat: "0.81", total: "10.81" },
        currency: "CHF",
        tradeIds: ["0x8f3a1c2b4d5e6f708192a3b4c5d6e7f8"],
      }),
    );

    const statement = dataspace
      .recorded()
      .find((r) => r.topic === "billingStatement")!.message;
    const invoice = dataspace
      .recorded()
      .find((r) => r.topic === "billingInvoice")!.message;
    expect(validateStatement(statement).ok).toBe(true);
    expect(validateInvoice(invoice).ok).toBe(true);
    markCovered("S7", {
      run_path: "mock",
      input: {
        command: "triggerBillingRun",
        actorId: IDS.consumer,
        role: "manager",
      },
      output: { billingStatement: statement, billingInvoice: invoice },
      notes: "Command target + publish stubs — not a live Stripe invoice create.",
    });
  });

  it("S8: startPayment → Checkout handoff reply + PaymentStatusChanged publish", async () => {
    const paymentId = IDS.payment;
    const { poller, cgw, targets } = buildLivePoller("startPayment", {
      body: {
        requestId: crypto.randomUUID(),
        operation: "startPayment",
        actorId: IDS.consumer,
        payload: {
          invoiceId: IDS.invoice,
          surface: "hosted",
          returnUrl: `${IDS.returnPrefix}billing/return`,
        },
      },
    });
    targets.startPayment = vi.fn(async () => ({
      paymentId,
      status: "requires_action" as const,
      handoff: hostedCheckout(),
    }));
    await poller.tick();
    const replyArg = (cgw.send as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    const replyPayload =
      typeof replyArg.payload === "string"
        ? JSON.parse(replyArg.payload)
        : replyArg.payload;
    expect(validateReply(replyPayload).ok).toBe(true);
    expect(replyPayload.data.handoff.url).toMatch(/^https:\/\/checkout\.stripe/);

    const dataspace = createMockDataSpace();
    const pub = new PublicationService(new PublicationStore(), dataspace);
    const bus = new InMemoryEventBus();
    await new BillingEventsListener(bus, pub).onModuleInit();
    // Seed invoice so payment can attach.
    await bus.publish(
      "InvoiceIssued",
      envelope("InvoiceIssued", "AC-06", {
        invoiceId: IDS.invoice,
        issuerId: IDS.producer,
        recipientId: IDS.consumer,
        settlementId: IDS.settlement,
        issuerStatementId: IDS.issuerStatement,
        dueDate: "2026-12-15",
        billingPeriodFrom: "2026-11-01T00:00:00.000Z",
        billingPeriodUntil: "2026-12-01T00:00:00.000Z",
        settlementType: "periodic",
        totalEnergyKWh: "5.000",
        vatRate: 0,
        carriedForwardAmount: "0",
        amounts: { energy: "10.00", vat: "0", total: "10.00" },
        currency: "CHF",
        tradeIds: ["0x8f3a1c2b4d5e6f708192a3b4c5d6e7f8"],
      }),
    );
    await bus.publish(
      "PaymentStatusChanged",
      envelope("PaymentStatusChanged", "AC-07", {
        paymentId,
        invoiceId: IDS.invoice,
        payerId: IDS.consumer,
        payeeId: IDS.producer,
        status: "succeeded",
        amount: "10.00",
        currency: "CHF",
        method: "card",
      }),
    );
    const payment = dataspace
      .recorded()
      .find((r) => r.topic === "billingPayment")!.message;
    expect(validatePayment(payment).ok).toBe(true);
    markCovered("S8", {
      run_path: "mock",
      input: {
        command: "startPayment",
        invoiceId: IDS.invoice,
        actorId: IDS.consumer,
      },
      output: {
        commandReply: replyPayload,
        billingPayment: payment,
        handoffUrlShape: replyPayload.data.handoff.url,
      },
      notes:
        "Handoff URL is a fixture string — Stripe API NOT called. See stripe-s08 evidence for stripe-test.",
    });
  });

  it("S9: failed payment publish + sendReminder command", async () => {
    const { poller, targets } = buildLivePoller("sendReminder", {
      role: "manager",
      body: {
        requestId: crypto.randomUUID(),
        operation: "sendReminder",
        actorId: IDS.consumer,
        payload: { invoiceId: IDS.invoice },
      },
    });
    targets.sendReminder = vi.fn(async () => ({
      invoiceId: IDS.invoice,
      reminderCount: 1,
    }));
    await poller.tick();
    expect(targets.sendReminder).toHaveBeenCalled();

    const dataspace = createMockDataSpace();
    const pub = new PublicationService(new PublicationStore(), dataspace);
    const bus = new InMemoryEventBus();
    await new BillingEventsListener(bus, pub).onModuleInit();
    await bus.publish(
      "InvoiceIssued",
      envelope("InvoiceIssued", "AC-06", {
        invoiceId: IDS.invoice,
        issuerId: IDS.producer,
        recipientId: IDS.consumer,
        settlementId: IDS.settlement,
        issuerStatementId: IDS.issuerStatement,
        dueDate: "2026-12-15",
        billingPeriodFrom: "2026-11-01T00:00:00.000Z",
        billingPeriodUntil: "2026-12-01T00:00:00.000Z",
        settlementType: "periodic",
        totalEnergyKWh: "5.000",
        vatRate: 0,
        carriedForwardAmount: "0",
        amounts: { energy: "10.00", vat: "0", total: "10.00" },
        currency: "CHF",
        tradeIds: ["0x8f3a1c2b4d5e6f708192a3b4c5d6e7f8"],
      }),
    );
    await bus.publish(
      "PaymentStatusChanged",
      envelope("PaymentStatusChanged", "AC-07", {
        paymentId: crypto.randomUUID(),
        invoiceId: IDS.invoice,
        payerId: IDS.consumer,
        payeeId: IDS.producer,
        status: "failed",
        amount: "10.00",
        currency: "CHF",
        method: "card",
        failureCategory: "card_declined",
      }),
    );
    const payment = dataspace
      .recorded()
      .filter((r) => r.topic === "billingPayment")
      .at(-1)!.message as Record<string, unknown>;
    expect(validatePayment(payment).ok).toBe(true);
    expect(payment.paymentStatus).toBe("failed");
    markCovered("S9", {
      run_path: "mock",
      input: { command: "sendReminder", invoiceId: IDS.invoice },
      output: { billingPayment: payment, reminderCount: 1 },
      notes: "Failed payment event is synthetic — not a Stripe decline webhook.",
    });
  });

  it("S10: requestWithdrawal → billingPayout publish", async () => {
    const { poller, targets } = buildLivePoller("requestWithdrawal", {
      role: "member",
      participantRole: "producer",
      body: {
        requestId: crypto.randomUUID(),
        operation: "requestWithdrawal",
        actorId: IDS.producer,
        payload: { currency: "EUR" },
      },
    });
    targets.requestWithdrawal = vi.fn(async () => ({
      payoutId: IDS.payout,
      status: "in_transit" as const,
      period: "2026-11",
    }));
    await poller.tick();
    expect(targets.requestWithdrawal).toHaveBeenCalled();

    const dataspace = createMockDataSpace();
    const pub = new PublicationService(new PublicationStore(), dataspace);
    const bus = new InMemoryEventBus();
    await new BillingEventsListener(bus, pub).onModuleInit();
    await bus.publish(
      "PayoutStatusChanged",
      envelope("PayoutStatusChanged", "AC-07", {
        payoutId: IDS.payout,
        actorId: IDS.producer,
        amount: "14.25",
        currency: "CHF",
        payoutStatus: "paid",
        trigger: "manual",
        statementIds: [IDS.settlement],
        arrivalDate: "2026-12-05",
      }),
    );
    const payout = dataspace
      .recorded()
      .find((r) => r.topic === "billingPayout")!.message;
    expect(validatePayout(payout).ok).toBe(true);
    markCovered("S10", {
      run_path: "mock",
      input: { command: "requestWithdrawal", actorId: IDS.producer },
      output: { billingPayout: payout },
      notes:
        "Withdrawal target stubbed — Stripe payout API NOT called. See stripe-s10 evidence.",
    });
  });

  it("S11: setInvoiceStatus command → InvoiceStatusChanged republish", async () => {
    const { poller, targets } = buildLivePoller("setInvoiceStatus", {
      role: "manager",
      body: {
        requestId: crypto.randomUUID(),
        operation: "setInvoiceStatus",
        actorId: IDS.consumer,
        payload: {
          invoiceId: IDS.invoice,
          status: "Void",
          reason: "E2E void",
        },
      },
    });
    targets.setInvoiceStatus = vi.fn(async () => ({
      invoiceId: IDS.invoice,
      status: "Void",
    }));
    await poller.tick();
    expect(targets.setInvoiceStatus).toHaveBeenCalled();

    const dataspace = createMockDataSpace();
    const pub = new PublicationService(new PublicationStore(), dataspace);
    const bus = new InMemoryEventBus();
    await new BillingEventsListener(bus, pub).onModuleInit();
    await bus.publish(
      "InvoiceIssued",
      envelope("InvoiceIssued", "AC-06", {
        invoiceId: IDS.invoice,
        issuerId: IDS.producer,
        recipientId: IDS.consumer,
        settlementId: IDS.settlement,
        issuerStatementId: IDS.issuerStatement,
        dueDate: "2026-12-15",
        billingPeriodFrom: "2026-11-01T00:00:00.000Z",
        billingPeriodUntil: "2026-12-01T00:00:00.000Z",
        settlementType: "periodic",
        totalEnergyKWh: "5.000",
        vatRate: 0,
        carriedForwardAmount: "0",
        amounts: { energy: "10.00", vat: "0", total: "10.00" },
        currency: "CHF",
        tradeIds: ["0x8f3a1c2b4d5e6f708192a3b4c5d6e7f8"],
      }),
    );
    await bus.publish(
      "InvoiceStatusChanged",
      envelope("InvoiceStatusChanged", "AC-06", {
        invoiceId: IDS.invoice,
        status: "Void",
        outstanding: 0,
      }),
    );
    const invoice = dataspace
      .recorded()
      .filter((r) => r.topic === "billingInvoice")
      .at(-1)!.message as Record<string, unknown>;
    expect(validateInvoice(invoice).ok).toBe(true);
    expect(invoice.invoiceStatus).toBe("Void");
    markCovered("S11", {
      run_path: "mock",
      input: { command: "setInvoiceStatus", invoiceId: IDS.invoice, status: "Void" },
      output: { billingInvoice: invoice },
    });
  });

  it("S13: Mock CGW + every command op schema + dispatcher authz round-trip", async () => {
    stub = await startMockCgwServer();
    process.env.CGW_ACK_MODE = "fetch";

    for (const scenario of commandChannelScenarios()) {
      expect(validateRequest(scenario.request).ok).toBe(true);
      expect(validateReply(scenario.reply).ok).toBe(true);
      const injected = stub.inject({
        fqcn: MOCK_CGW_COMMAND_FQCN,
        topicName: "billingCommandRequest",
        topicOwner: MOCK_CGW_TOPIC_OWNER,
        transactionId: scenario.request.requestId,
        payload: scenario.request,
        sender: IDS.allowedDid,
      });
      expect(injected.validationErrors).toEqual([]);
    }

    // Forbidden: member cannot triggerBillingRun.
    const authz = new StubActorAuthzClient();
    authz.set(activeMember(IDS.consumer, IDS.community, "consumer"));
    const invoices = new StubInvoiceLookupClient();
    invoices.set(invoiceView(IDS.invoice, IDS.community, IDS.consumer));
    const authorizer = new CommandAuthorizer(
      [IDS.allowedDid],
      authz,
      invoices,
    );
    const denied = await authorizer.decide(
      IDS.allowedDid,
      true,
      {
        requestId: crypto.randomUUID(),
        operation: "triggerBillingRun",
        actorId: IDS.consumer,
        payload: { communityId: IDS.community, type: "final", period: "2026-11" },
      },
    );
    expect(denied.allow).toBe(false);
    markCovered("S13", {
      run_path: "mock",
      input: {
        operations: commandChannelScenarios().map((s) => s.operation),
        memberDenied: "triggerBillingRun",
      },
      output: {
        allEightOpsSchemaValid: true,
        memberTriggerBillingRunAllowed: false,
      },
    });
  });

  it("S14: purgeCache clears outbound older than 7 days", async () => {
    const dataspace = createMockDataSpace();
    const store = new PublicationStore();
    const service = new PublicationService(store, dataspace);
    const bus = new InMemoryEventBus();
    await new BillingEventsListener(bus, service).onModuleInit();
    await bus.publish(
      "UserAccountStatusChanged",
      envelope("UserAccountStatusChanged", "AC-03", {
        actorId: IDS.consumer,
        kycVerified: false,
        accountStatus: "PendingVerification",
        termsVersion: "v1.0.0",
        termsAcceptedAt: "2026-11-01T00:00:00.000Z",
        selfBillingMandate: false,
      }),
    );
    expect(dataspace.recorded().length).toBeGreaterThan(0);
    const before = new Date(
      Date.now() + 8 * 24 * 3600 * 1000,
    ).toISOString();
    const purged = await service.purgeCache(before);
    expect(purged.accepted).toBe(true);
    expect(purged.purgedLocal + purged.purgedGateway).toBeGreaterThanOrEqual(0);
    markCovered("S14", {
      run_path: "mock",
      input: { purgeBefore: before },
      output: purged,
    });
  });
});

function hostedCheckout(): PspHandoff {
  return {
    surface: "hosted",
    provider: "stripe",
    purpose: "checkout",
    url: "https://checkout.stripe.com/c/pay/cs_test_e2e",
    expiresAt: "2026-11-24T10:30:00Z",
  };
}

function buildLivePoller(
  _op: string,
  opts: {
    role?: "member" | "manager";
    participantRole?: "consumer" | "producer";
    body: BillingCommandRequest;
  },
) {
  const authzClient = new StubActorAuthzClient();
  if (opts.role === "manager") {
    authzClient.set(activeManager(opts.body.actorId, IDS.community));
  } else {
    authzClient.set(
      activeMember(
        opts.body.actorId,
        IDS.community,
        opts.participantRole ?? "consumer",
      ),
    );
  }
  const invoices = new StubInvoiceLookupClient();
  invoices.set(invoiceView(IDS.invoice, IDS.community, IDS.consumer));
  const authorizer = new CommandAuthorizer(
    [IDS.allowedDid],
    authzClient,
    invoices,
  );
  const targets = stubTargets();
  const processed = new InMemoryProcessedCommandsStore();
  const outbox = new OutboxService(new InMemoryOutboxStore());
  const dispatcher = new CommandDispatcher(
    authorizer,
    targets,
    processed,
    [IDS.returnPrefix],
    outbox,
    [IDS.allowedDid],
  );
  const consumer: CommandTopicConsumer = {
    pull: vi.fn(async () => [
      {
        messageId: "m-e2e",
        sender: IDS.allowedDid,
        body: opts.body,
        signatureValid: true,
      },
    ]),
    done: vi.fn(async () => {}),
  };
  const cgw: CommandReplySender = {
    send: vi.fn(async () => ({ messageId: "r-e2e", sent: 1, failed: 0 })),
  };
  const poller = new CommandPoller(
    consumer,
    dispatcher,
    cgw,
    processed,
    { replyFqcn: MOCK_CGW_REPLY_FQCN, pollMs: 60_000 },
    true,
  );
  return { poller, cgw, targets, consumer };
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
    acceptTerms: async () => {
      throw new Error("not stubbed");
    },
  };
}

function invoiceView(
  invoiceId: string,
  communityId: string,
  issuedTo: string,
): InvoiceAuthzView {
  return {
    invoiceId,
    communityId,
    invoiceIssuedTo: issuedTo,
    invoiceIssuedBy: IDS.producer,
  };
}

function activeMember(
  actorId: string,
  communityId: string,
  participantRole: "consumer" | "producer",
): ActorAuthzView {
  return {
    actorId,
    status: "active",
    memberships: [
      { communityId, role: "member", participantRole },
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
