import { describe, expect, it, vi } from "vitest";
import {
  InMemoryOutboxStore,
  OutboxService,
} from "@intelligent/module-template";
import { CommandAuthorizer } from "./command-authorizer.js";
import { CommandDispatcher } from "./command-dispatcher.js";
import {
  CommandPoller,
  createCommandPoller,
  type CommandReplySender,
  type CommandTopicConsumer,
} from "./command-poller.js";
import type {
  ActorAuthzView,
  BillingCommandRequest,
  InvoiceAuthzView,
  PspHandoff,
} from "./billing-command.types.js";
import type { CommandTargetsPort } from "./command-targets.client.js";
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

describe("CommandPoller (REQ-052 / A7 / REQ-053)", () => {
  it("A7: one tick pulls 1 request, sends 1 reply with transactionId = requestId, marks processed", async () => {
    const { poller, consumer, cgw, doneIds } = livePoller();
    const r = await poller.tick();
    void r;
    expect(consumer.pull).toHaveBeenCalled();
    expect(cgw.send).toHaveBeenCalledTimes(1);
    expect(cgw.send).toHaveBeenCalledWith(
      expect.objectContaining({
        fqcn: "blooo.intelligent.billing.replies.pub",
        topicName: "billingCommandReply",
        transactionId: REQUEST_ID,
      }),
    );
    expect(doneIds).toEqual(["m1"]);
  });

  it("COMMAND_CHANNEL_ENABLED unset -> poller not started (no CGW call)", async () => {
    const cgw: CommandReplySender = {
      send: vi.fn(async () => ({ messageId: "x", sent: 1, failed: 0 })),
    };
    const poller = createCommandPoller(
      { COMMAND_CHANNEL_ENABLED: undefined },
      {
        outbox: new OutboxService(new InMemoryOutboxStore()),
        cgw,
        consumer: {
          pull: vi.fn(async () => [
            {
              messageId: "m1",
              sender: ALLOWED,
              body: baseBody(),
            },
          ]),
          done: vi.fn(async () => {}),
        },
      },
    );
    poller.onModuleInit();
    await poller.tick();
    expect(cgw.send).not.toHaveBeenCalled();
  });

  it("reply send failure -> message stays 'received' and is retried next tick; reply stays idempotent", async () => {
    const targets = stubTargets();
    let startCalls = 0;
    targets.startPayment = vi.fn(async () => {
      startCalls += 1;
      return {
        paymentId: PAYMENT_ID,
        status: "requires_action" as const,
        handoff: hostedCheckout(),
      };
    });
    const doneIds: string[] = [];
    const statuses = new Map<string, "received" | "processed">();
    statuses.set("m1", "received");

    let delivered = false;
    const consumer: CommandTopicConsumer = {
      pull: vi.fn(async () => {
        // CGW delivers once; poller keeps the message in pending until reply succeeds.
        if (delivered || statuses.get("m1") === "processed") return [];
        delivered = true;
        return [
          {
            messageId: "m1",
            sender: ALLOWED,
            body: baseBody(),
            signatureValid: true,
          },
        ];
      }),
      done: vi.fn(async (id, ok) => {
        if (ok) {
          doneIds.push(id);
          statuses.set(id, "processed");
        }
      }),
    };

    let failOnce = true;
    const cgw: CommandReplySender = {
      send: vi.fn(async () => {
        if (failOnce) {
          failOnce = false;
          throw new Error("CGW down");
        }
        return { messageId: "r1", sent: 1, failed: 0 };
      }),
    };

    const { poller } = buildPoller({ consumer, cgw, targets });
    await poller.tick();
    expect(doneIds).toEqual([]);
    expect(statuses.get("m1")).toBe("received");
    expect(cgw.send).toHaveBeenCalledTimes(1);

    await poller.tick();
    expect(doneIds).toEqual(["m1"]);
    expect(cgw.send).toHaveBeenCalledTimes(2);
    // Idempotent: target called once across retries (processed store).
    expect(startCalls).toBe(1);
  });

  it("REQ-053: daily purge invoked with now; store keeps nothing older than 7 days", async () => {
    const processed = new InMemoryProcessedCommandsStore();
    await processed.put(
      REQUEST_ID,
      {
        requestId: REQUEST_ID,
        operation: "startPayment",
        success: true,
        data: { paymentId: PAYMENT_ID, status: "succeeded" },
      },
      new Date("2026-01-01T00:00:00Z"),
    );
    const { poller } = buildPoller({ processed });
    const removed = await poller.purge(new Date("2026-01-10T00:00:00Z"));
    expect(removed).toBe(1);
    expect(await processed.get(REQUEST_ID)).toBeNull();
  });

  it("a reply for a requestId not in processed and not received by this pod is not re-sent", async () => {
    const cgw: CommandReplySender = {
      send: vi.fn(async () => ({ messageId: "x", sent: 1, failed: 0 })),
    };
    const consumer: CommandTopicConsumer = {
      pull: vi.fn(async () => []),
      done: vi.fn(async () => {}),
    };
    const { poller } = buildPoller({ consumer, cgw });
    await poller.tick();
    expect(cgw.send).not.toHaveBeenCalled();
  });

  it("createCommandPoller refuses COMMAND_CHANNEL_ENABLED without EWDS_REPLY_ENCRYPTED", () => {
    expect(() =>
      createCommandPoller(
        {
          COMMAND_CHANNEL_ENABLED: "true",
          EWDS_REPLY_ENCRYPTED: "false",
          CGW_BASE_URL: "http://cgw",
          CGW_API_KEY: "k",
        },
        { outbox: new OutboxService(new InMemoryOutboxStore()) },
      ),
    ).toThrow(/EWDS_REPLY_ENCRYPTED/);
  });

  it("createCommandPoller enabled with injected consumer+cgw starts and ticks", async () => {
    const doneIds: string[] = [];
    const consumer: CommandTopicConsumer = {
      pull: vi.fn(async () => [
        {
          messageId: "m-live",
          sender: ALLOWED,
          body: baseBody(),
          signatureValid: true,
        },
      ]),
      done: vi.fn(async (id) => {
        doneIds.push(id);
      }),
    };
    const cgw: CommandReplySender = {
      send: vi.fn(async () => ({ messageId: "r", sent: 1, failed: 0 })),
    };
    const targets = stubTargets();
    targets.startPayment = vi.fn(async () => ({
      paymentId: PAYMENT_ID,
      status: "requires_action" as const,
      handoff: hostedCheckout(),
    }));
    const authzClient = new StubActorAuthzClient();
    authzClient.set(activeMember(ACTOR, C1));
    const invoices = new StubInvoiceLookupClient();
    invoices.set(invoice(INV, C1, ACTOR));
    const processed = new InMemoryProcessedCommandsStore();
    const outbox = new OutboxService(new InMemoryOutboxStore());
    const dispatcher = new CommandDispatcher(
      new CommandAuthorizer([ALLOWED], authzClient, invoices),
      targets,
      processed,
      [RETURN_PREFIX],
      outbox,
      [ALLOWED],
    );
    const poller = createCommandPoller(
      {
        COMMAND_CHANNEL_ENABLED: "true",
        EWDS_REPLY_ENCRYPTED: "true",
        EWDS_COMMAND_ALLOWED_DIDS: ALLOWED,
        EWDS_COMMAND_RETURN_URL_PREFIXES: RETURN_PREFIX,
      },
      { outbox, consumer, cgw, dispatcher, processed },
    );
    // Drive a single tick without onModuleInit (avoids re-entry with boot tick).
    await poller.tick();
    poller.onModuleDestroy();
    expect(cgw.send).toHaveBeenCalled();
    expect(doneIds).toContain("m-live");
  });

  it("createCommandPoller enabled without outbox throws", () => {
    expect(() =>
      createCommandPoller({
        COMMAND_CHANNEL_ENABLED: "true",
        EWDS_REPLY_ENCRYPTED: "true",
        CGW_BASE_URL: "http://cgw",
        CGW_API_KEY: "k",
      }),
    ).toThrow(/OutboxService/);
  });

  it("createCommandPoller builds a default consumer when none is injected", async () => {
    const outbox = new OutboxService(new InMemoryOutboxStore());
    const cgw: CommandReplySender = {
      send: vi.fn(async () => ({ messageId: "r", sent: 1, failed: 0 })),
    };
    const poller = createCommandPoller(
      {
        COMMAND_CHANNEL_ENABLED: "true",
        EWDS_REPLY_ENCRYPTED: "true",
        CGW_BASE_URL: "http://cgw",
        CGW_API_KEY: "k",
        EWDS_COMMAND_ALLOWED_DIDS: ALLOWED,
        EWDS_COMMAND_RETURN_URL_PREFIXES: RETURN_PREFIX,
        PARTICIPANTS_INTERNAL_URL: "http://participants",
        PAYMENTS_INTERNAL_URL: "http://payments",
        INVOICING_INTERNAL_URL: "http://invoicing",
      },
      { outbox, cgw },
    );
    // Default consumer + empty CGW queue — tick should not throw.
    await expect(poller.tick()).resolves.toBeUndefined();
    poller.onModuleDestroy();
  });

  it("re-entry guard skips overlapping ticks", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const consumer: CommandTopicConsumer = {
      pull: vi.fn(async () => {
        await gate;
        return [];
      }),
      done: vi.fn(async () => {}),
    };
    const { poller } = buildPoller({ consumer });
    const first = poller.tick();
    await poller.tick(); // overlapping — skipped
    release();
    await first;
    expect(consumer.pull).toHaveBeenCalledTimes(1);
  });

  it("INT-439: CGW pull failure is swallowed so the pod stays up", async () => {
    const consumer: CommandTopicConsumer = {
      pull: vi.fn(async () => {
        throw new Error("CGW /api/v2/messages returned 400: CHANNEL::NOT_FOUND");
      }),
      done: vi.fn(async () => {}),
    };
    const { poller } = buildPoller({ consumer });
    await expect(poller.tick()).resolves.toBeUndefined();
  });

  it("layer-2 drop marks message done without CGW reply", async () => {
    const doneIds: string[] = [];
    const consumer: CommandTopicConsumer = {
      pull: vi.fn(async () => [
        {
          messageId: "m-drop",
          sender: "did:ethr:0xEVIL",
          body: baseBody(),
          signatureValid: true,
        },
      ]),
      done: vi.fn(async (id) => {
        doneIds.push(id);
      }),
    };
    const cgw: CommandReplySender = {
      send: vi.fn(async () => ({ messageId: "r", sent: 1, failed: 0 })),
    };
    const { poller } = buildPoller({ consumer, cgw });
    await poller.tick();
    expect(doneIds).toEqual(["m-drop"]);
    expect(cgw.send).not.toHaveBeenCalled();
  });
});

function livePoller() {
  const doneIds: string[] = [];
  const consumer: CommandTopicConsumer = {
    pull: vi.fn(async () => [
      {
        messageId: "m1",
        sender: ALLOWED,
        body: baseBody(),
        signatureValid: true,
      },
    ]),
    done: vi.fn(async (id) => {
      doneIds.push(id);
    }),
  };
  const cgw: CommandReplySender = {
    send: vi.fn(async () => ({ messageId: "r1", sent: 1, failed: 0 })),
  };
  const targets = stubTargets();
  targets.startPayment = vi.fn(async () => ({
    paymentId: PAYMENT_ID,
    status: "requires_action" as const,
    handoff: hostedCheckout(),
  }));
  const { poller } = buildPoller({ consumer, cgw, targets });
  return { poller, consumer, cgw, doneIds };
}

function buildPoller(opts: {
  consumer?: CommandTopicConsumer;
  cgw?: CommandReplySender;
  targets?: CommandTargetsPort;
  processed?: InMemoryProcessedCommandsStore;
}) {
  const authzClient = new StubActorAuthzClient();
  authzClient.set(activeMember(ACTOR, C1));
  const invoices = new StubInvoiceLookupClient();
  invoices.set(invoice(INV, C1, ACTOR));
  const authorizer = new CommandAuthorizer(
    [ALLOWED],
    authzClient,
    invoices,
  );
  const targets = opts.targets ?? stubTargets();
  const processed = opts.processed ?? new InMemoryProcessedCommandsStore();
  const outbox = new OutboxService(new InMemoryOutboxStore());
  const dispatcher = new CommandDispatcher(
    authorizer,
    targets,
    processed,
    [RETURN_PREFIX],
    outbox,
    [ALLOWED],
  );
  const consumer: CommandTopicConsumer = opts.consumer ?? {
    pull: async () => [],
    done: async () => {},
  };
  const cgw: CommandReplySender = opts.cgw ?? {
    send: async () => ({ messageId: "x", sent: 1, failed: 0 }),
  };
  const poller = new CommandPoller(
    consumer,
    dispatcher,
    cgw,
    processed,
    { replyFqcn: "blooo.intelligent.billing.replies.pub", pollMs: 60_000 },
    true,
  );
  return { poller, processed };
}

function baseBody(): BillingCommandRequest {
  return {
    requestId: REQUEST_ID,
    operation: "startPayment",
    actorId: ACTOR,
    payload: {
      invoiceId: INV,
      surface: "hosted",
      returnUrl: `${RETURN_PREFIX}billing/return`,
    },
  };
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
