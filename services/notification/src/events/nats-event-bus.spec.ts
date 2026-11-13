import { afterEach, describe, expect, it, vi } from "vitest";
import { InMemoryEventBus } from "./in-memory-event-bus.js";

const connect = vi.fn();

vi.mock("nats", () => ({
  AckPolicy: { Explicit: "explicit" },
  DeliverPolicy: { All: "all" },
  connect: (...args: unknown[]) => connect(...args),
}));

const { createEventBus, NatsEventBus } = await import("./nats-event-bus.js");

function mockCoreNc(overrides: Record<string, unknown> = {}) {
  type Msg = { string: () => string };
  const queue: Msg[] = [];
  const waiters: Array<(m: Msg | null) => void> = [];
  let closed = false;
  const sub = {
    [Symbol.asyncIterator]() {
      return {
        async next() {
          if (queue.length > 0) {
            return { value: queue.shift()!, done: false };
          }
          if (closed) return { value: undefined, done: true };
          const msg = await new Promise<Msg | null>((resolve) => {
            waiters.push(resolve);
          });
          if (!msg) return { value: undefined, done: true };
          return { value: msg, done: false };
        },
      };
    },
    unsubscribe: vi.fn(() => {
      closed = true;
      while (waiters.length) waiters.shift()!(null);
    }),
  };
  return {
    subscribe: vi.fn(() => sub),
    publish: vi.fn(),
    drain: vi.fn(async () => undefined),
    jetstream: vi.fn(),
    jetstreamManager: vi.fn(),
    _push(raw: string) {
      const msg = { string: () => raw };
      if (waiters.length) waiters.shift()!(msg);
      else queue.push(msg);
    },
    _sub: sub,
    ...overrides,
  };
}

describe("createEventBus (INT-217)", () => {
  afterEach(() => {
    connect.mockReset();
  });

  it("uses in-memory when NATS_URL is unset", () => {
    expect(createEventBus({})).toBeInstanceOf(InMemoryEventBus);
  });

  it("uses NatsEventBus when NATS_URL is set", () => {
    const bus = createEventBus({ NATS_URL: "nats://127.0.0.1:4222" });
    expect(bus).toBeInstanceOf(NatsEventBus);
  });

  it("passes NATS_STREAM for JetStream durable consumers", () => {
    const bus = createEventBus({
      NATS_URL: "nats://127.0.0.1:4222",
      NATS_STREAM: "intelligent",
      NATS_SUBJECT_PREFIX: "intelligent.dev",
    });
    expect(bus).toBeInstanceOf(NatsEventBus);
  });
});

describe("NatsEventBus core subscribe (INT-217)", () => {
  afterEach(() => {
    connect.mockReset();
  });

  it("subscribes, dispatches JSON payloads, publishes and closes", async () => {
    const nc = mockCoreNc();
    connect.mockResolvedValue(nc);
    const bus = new NatsEventBus("nats://127.0.0.1:4222", "intelligent.dev");
    const handler = vi.fn(async () => undefined);
    await bus.subscribe("PaymentStatusChanged", handler);
    expect(nc.subscribe).toHaveBeenCalledWith(
      "intelligent.dev.PaymentStatusChanged",
    );
    nc._push(JSON.stringify({ type: "PaymentStatusChanged", data: { a: 1 } }));
    nc._push("not-json");
    await vi.waitFor(() => {
      expect(handler).toHaveBeenCalledTimes(2);
    });
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ type: "PaymentStatusChanged" }),
    );
    expect(handler).toHaveBeenCalledWith("not-json");

    await bus.publish("PaymentStatusChanged", { ok: true });
    expect(nc.publish).toHaveBeenCalledWith(
      "intelligent.dev.PaymentStatusChanged",
      JSON.stringify({ ok: true }),
    );

    await bus.close();
    expect(nc._sub.unsubscribe).toHaveBeenCalled();
    expect(nc.drain).toHaveBeenCalled();
  });
});

describe("NatsEventBus JetStream (INT-217)", () => {
  afterEach(() => {
    connect.mockReset();
  });

  it("binds durable consumer, acks successes and naks handler failures", async () => {
    const ack = vi.fn();
    const nak = vi.fn();
    const jsMessages = [
      { string: () => JSON.stringify({ eventId: "e1" }), ack, nak },
      {
        string: () => JSON.stringify({ eventId: "e2" }),
        ack,
        nak,
      },
    ];
    let delivered = 0;
    const consumeIter = {
      [Symbol.asyncIterator]() {
        return {
          async next() {
            if (delivered < jsMessages.length) {
              return { value: jsMessages[delivered++]!, done: false };
            }
            return { value: undefined, done: true };
          },
        };
      },
      stop: vi.fn(),
    };
    const consumersAdd = vi
      .fn()
      .mockRejectedValueOnce(new Error("already exists"))
      .mockResolvedValue(undefined);
    const nc = mockCoreNc({
      jetstreamManager: vi.fn(async () => ({
        consumers: { add: consumersAdd },
      })),
      jetstream: vi.fn(() => ({
        publish: vi.fn(async () => ({})),
        consumers: {
          get: vi.fn(async () => ({
            consume: vi.fn(async () => consumeIter),
          })),
        },
      })),
    });
    connect.mockResolvedValue(nc);

    const bus = new NatsEventBus(
      "nats://127.0.0.1:4222",
      "intelligent.dev",
      "intelligent",
    );
    const handler = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("handler boom"));
    await bus.subscribe("PaymentStatusChanged", handler);
    await new Promise((r) => setTimeout(r, 20));
    expect(handler).toHaveBeenCalledTimes(2);
    expect(ack).toHaveBeenCalled();
    expect(nak).toHaveBeenCalled();

    await bus.publish("PaymentStatusChanged", { x: 1 });
    expect(nc.jetstream).toHaveBeenCalled();

    await bus.close();
    expect(consumeIter.stop).toHaveBeenCalled();
  });
});

describe("NatsEventBus shared connection (INT-382)", () => {
  afterEach(() => {
    connect.mockReset();
  });

  it("opens one connection for concurrent subscribers and retries after a failed connect", async () => {
    const bus = new NatsEventBus("nats://127.0.0.1:4222", "intelligent.dev");
    connect.mockRejectedValueOnce(new Error("broker down"));
    await expect(bus.subscribe("A", vi.fn())).rejects.toThrow("broker down");

    const nc = mockCoreNc();
    connect.mockResolvedValue(nc);
    await Promise.all([bus.subscribe("A", vi.fn()), bus.subscribe("B", vi.fn())]);
    expect(connect).toHaveBeenCalledTimes(2);
    expect(nc.subscribe).toHaveBeenCalledTimes(2);

    await bus.close();
    await bus.publish("A", { ok: true });
    expect(connect).toHaveBeenCalledTimes(3);
  });
});
