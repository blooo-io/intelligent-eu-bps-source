import { afterEach, describe, expect, it, vi } from "vitest";

const connect = vi.fn();

vi.mock("nats", () => ({
  AckPolicy: { Explicit: "explicit" },
  DeliverPolicy: { All: "all" },
  connect: (...args: unknown[]) => connect(...args),
}));

const { createEventBus, NatsEventBus } = await import("./nats-event-bus.js");

function mockCoreNc() {
  const sub = {
    [Symbol.asyncIterator]() {
      return { next: async () => ({ value: undefined, done: true }) };
    },
    unsubscribe: vi.fn(),
  };
  return {
    subscribe: vi.fn(() => sub),
    publish: vi.fn(),
    drain: vi.fn(async () => undefined),
  };
}

describe("createEventBus", () => {
  it("uses NatsEventBus when NATS_URL is set", () => {
    expect(createEventBus({ NATS_URL: "nats://127.0.0.1:4222" })).toBeInstanceOf(NatsEventBus);
  });
});

describe("NatsEventBus authentication (INT-338)", () => {
  const saved = { user: process.env.NATS_USER, pass: process.env.NATS_PASSWORD };
  afterEach(() => {
    connect.mockReset();
    process.env.NATS_USER = saved.user;
    process.env.NATS_PASSWORD = saved.pass;
    if (saved.user === undefined) delete process.env.NATS_USER;
    if (saved.pass === undefined) delete process.env.NATS_PASSWORD;
  });

  it("passes the broker account when NATS_USER is set", async () => {
    process.env.NATS_USER = "svc";
    process.env.NATS_PASSWORD = "pw";
    connect.mockResolvedValue(mockCoreNc());
    const bus = new NatsEventBus("nats://127.0.0.1:4222");
    await bus.subscribe("A", vi.fn());
    expect(connect).toHaveBeenCalledWith({ servers: "nats://127.0.0.1:4222", user: "svc", pass: "pw" });
    await bus.close();
  });
})

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
    await bus.subscribe("C", vi.fn());
    expect(connect).toHaveBeenCalledTimes(3);
  });
});
