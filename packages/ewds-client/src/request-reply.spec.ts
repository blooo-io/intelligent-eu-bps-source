import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CgwClient, CgwMessage, CgwSend } from "./cgw-client.js";
import {
  EwdsRemoteError,
  EwdsTimeoutError,
  RequestReplyClient,
} from "./request-reply.js";

type FakeState = {
  sent: CgwSend[];
  acked: string[][];
  receiveQueue: CgwMessage[][];
  receiveCalls: number;
};

function fakeCgw(state: FakeState): CgwClient {
  return {
    send: vi.fn(async (m: CgwSend) => {
      state.sent.push(m);
      return { messageId: "out-1", sent: 1, failed: 0 };
    }),
    receive: vi.fn(async () => {
      const batch = state.receiveQueue.shift() ?? [];
      state.receiveCalls += 1;
      return batch;
    }),
    ack: vi.fn(async (ids: string[]) => {
      state.acked.push(ids);
    }),
    identity: vi.fn(async () => ({ did: "did:test", balance: "OK" })),
  } as unknown as CgwClient;
}

const channel = {
  requestFqcn: "gsy.intelligent.requests.pub",
  responseFqcn: "gsy.intelligent.responses.sub",
  topicOwner: "integration.apps.intelligent.auth.ewc",
  topicVersion: "1.0.0",
  pollMs: 5,
  ttlMs: 60_000,
};

describe("RequestReplyClient (REQ-001)", () => {
  const clients: RequestReplyClient[] = [];

  beforeEach(() => {
    clients.length = 0;
    vi.useFakeTimers();
  });
  afterEach(() => {
    // Clear poll intervals before restoring real timers (avoids unhandled rejections).
    for (const c of clients) c.close();
    clients.length = 0;
    vi.useRealTimers();
  });

  function track(rr: RequestReplyClient): RequestReplyClient {
    clients.push(rr);
    return rr;
  }

  it("REQ-001: matches the response by requestId and ignores others", async () => {
    const state: FakeState = {
      sent: [],
      acked: [],
      receiveQueue: [
        [
          msg("other-id", {
            requestId: "other-id",
            success: true,
            data: [{ noise: 1 }],
          }),
        ],
        [
          msg("r1", {
            requestId: "r1",
            success: true,
            data: [{ x: 1 }],
          }),
        ],
      ],
      receiveCalls: 0,
    };
    const cgw = fakeCgw(state);
    const rr = track(new RequestReplyClient(cgw, channel, () => "r1"));
    const p = rr.request("tradesQuery", { from: 0, to: 86400 });
    await vi.runAllTimersAsync();
    await expect(p).resolves.toEqual([{ x: 1 }]);
    expect(state.sent[0]).toMatchObject({
      fqcn: "gsy.intelligent.requests.pub",
      topicName: "tradesQuery",
      transactionId: "r1",
    });
  });

  it("buffers an early response for a later concurrent request (two in flight)", async () => {
    const state: FakeState = {
      sent: [],
      acked: [],
      receiveQueue: [
        [
          msg("early", {
            requestId: "req-2",
            success: true,
            data: [{ n: 2 }],
          }),
        ],
        [
          msg("late", {
            requestId: "req-1",
            success: true,
            data: [{ n: 1 }],
          }),
        ],
      ],
      receiveCalls: 0,
    };
    const cgw = fakeCgw(state);
    let n = 0;
    const rr = track(
      new RequestReplyClient(cgw, channel, () => {
        n += 1;
        return n === 1 ? "req-1" : "req-2";
      }),
    );
    const p1 = rr.request("tradesQuery", { id: 1 }, { timeoutMs: 500 });
    const p2 = rr.request("tradesQuery", { id: 2 }, { timeoutMs: 500 });
    await vi.runAllTimersAsync();
    await expect(p1).resolves.toEqual([{ n: 1 }]);
    await expect(p2).resolves.toEqual([{ n: 2 }]);
  });

  it("rejects with EwdsTimeoutError after timeoutMs=50 (fake timers)", async () => {
    const state: FakeState = {
      sent: [],
      acked: [],
      receiveQueue: [],
      receiveCalls: 0,
    };
    const cgw = fakeCgw(state);
    const rr = track(new RequestReplyClient(cgw, { ...channel, pollMs: 10 }));
    const p = rr.request("tradesQuery", {}, { timeoutMs: 50 });
    const assertion = expect(p).rejects.toBeInstanceOf(EwdsTimeoutError);
    await vi.advanceTimersByTimeAsync(60);
    await assertion;
  });

  it("success:false with string error -> EwdsRemoteError", async () => {
    const state: FakeState = {
      sent: [],
      acked: [],
      receiveQueue: [
        [msg("r1", { requestId: "r1", success: false, error: "denied" })],
      ],
      receiveCalls: 0,
    };
    const cgw = fakeCgw(state);
    const rr = track(new RequestReplyClient(cgw, channel, () => "r1"));
    const p = rr.request("tradesQuery", {});
    const assertion = expect(p).rejects.toBeInstanceOf(EwdsRemoteError);
    await vi.runAllTimersAsync();
    await assertion;
  });

  it("success:false -> EwdsRemoteError('rate_limited', ...)", async () => {
    const state: FakeState = {
      sent: [],
      acked: [],
      receiveQueue: [
        [
          msg("r1", {
            requestId: "r1",
            success: false,
            error: { code: "rate_limited", message: "slow down" },
          }),
        ],
      ],
      receiveCalls: 0,
    };
    const cgw = fakeCgw(state);
    const rr = track(new RequestReplyClient(cgw, channel, () => "r1"));
    const p = rr.request("tradesQuery", {});
    const assertion = expect(p).rejects.toMatchObject({
      name: "EwdsRemoteError",
      code: "rate_limited",
    });
    await vi.runAllTimersAsync();
    await assertion;
  });

  it("ignores expired orphans", async () => {
    const state: FakeState = {
      sent: [],
      acked: [],
      receiveQueue: [
        [
          msg("orphan", {
            requestId: "stale",
            success: true,
            data: [{ stale: true }],
          }),
        ],
        [],
      ],
      receiveCalls: 0,
    };
    const cgw = fakeCgw(state);
    const rr = track(
      new RequestReplyClient(cgw, { ...channel, pollMs: 5, ttlMs: 10 }, () => "noise"),
    );
    const p1 = rr.request("tradesQuery", {}, { timeoutMs: 30 });
    await vi.advanceTimersByTimeAsync(35);
    await expect(p1).rejects.toBeInstanceOf(EwdsTimeoutError);

    const rr2 = track(
      new RequestReplyClient(cgw, { ...channel, pollMs: 5, ttlMs: 10 }, () => "stale"),
    );
    const p2 = rr2.request("tradesQuery", {}, { timeoutMs: 30 });
    await vi.advanceTimersByTimeAsync(35);
    await expect(p2).rejects.toBeInstanceOf(EwdsTimeoutError);
  });

  it("reuses a buffered orphan when the same requestId is requested again", async () => {
    const state: FakeState = {
      sent: [],
      acked: [],
      receiveQueue: [
        [
          msg("orphan", {
            requestId: "cached",
            success: true,
            data: [{ z: 1 }],
          }),
        ],
        [],
      ],
      receiveCalls: 0,
    };
    const cgw = fakeCgw(state);
    let n = 0;
    const rr = track(
      new RequestReplyClient(cgw, { ...channel, pollMs: 5 }, () =>
        n++ === 0 ? "other" : "cached",
      ),
    );
    const dangling = rr.request("tradesQuery", {}, { timeoutMs: 40 });
    const hang = expect(dangling).rejects.toBeInstanceOf(EwdsTimeoutError);
    await vi.advanceTimersByTimeAsync(50);
    await hang;
    await expect(rr.request("tradesQuery", {})).resolves.toEqual([{ z: 1 }]);
  });

  it("ignores malformed JSON payloads", async () => {
    const state: FakeState = {
      sent: [],
      acked: [],
      receiveQueue: [
        [
          {
            ...msg("garbage", {}),
            payload: "not-json",
          },
        ],
      ],
      receiveCalls: 0,
    };
    const cgw = fakeCgw(state);
    const rr = track(
      new RequestReplyClient(cgw, { ...channel, pollMs: 5 }, () => "r1"),
    );
    const p = rr.request("tradesQuery", {}, { timeoutMs: 50 });
    const assertion = expect(p).rejects.toBeInstanceOf(EwdsTimeoutError);
    await vi.advanceTimersByTimeAsync(60);
    await assertion;
  });

  it("drops buffered unmatched responses older than ttlMs=60000", async () => {
    const state: FakeState = {
      sent: [],
      acked: [],
      receiveQueue: [
        [
          msg("orphan", {
            requestId: "orphan",
            success: true,
            data: [{ stale: true }],
          }),
        ],
        [],
      ],
      receiveCalls: 0,
    };
    const cgw = fakeCgw(state);
    const rr = track(
      new RequestReplyClient(
        cgw,
        { ...channel, ttlMs: 60_000, pollMs: 5 },
        () => "wanted",
      ),
    );
    const p = rr.request("tradesQuery", {}, { timeoutMs: 200 });
    const assertion = expect(p).rejects.toBeInstanceOf(EwdsTimeoutError);
    await vi.advanceTimersByTimeAsync(65_000);
    await assertion;
  });
});

function msg(id: string, body: unknown): CgwMessage {
  return {
    id,
    topicName: "tradesQueryResponse",
    topicOwner: "integration.apps.intelligent.auth.ewc",
    topicVersion: "1.0.0",
    transactionId: id,
    payload: JSON.stringify(body),
    sender: "did:ethr:gsy",
    signatureValid: true,
    timestampNanos: Date.now() * 1_000_000,
  };
}