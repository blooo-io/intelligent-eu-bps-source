import { randomUUID } from "node:crypto";
import type { CgwClient, CgwMessage } from "./cgw-client.js";

export type RequestEnvelope<P> = {
  requestId: string;
  operation: string;
  payload: P;
};

export type ResponseEnvelope<D> = {
  requestId: string;
  success: boolean;
  data?: D[];
  error?: { code?: string; message: string } | string;
};

export class EwdsTimeoutError extends Error {
  constructor() {
    super("EWDS request/reply timed out");
    this.name = "EwdsTimeoutError";
  }
}

export class EwdsRemoteError extends Error {
  constructor(
    readonly code: string,
    msg: string,
  ) {
    super(msg);
    this.name = "EwdsRemoteError";
  }
}

type Pending = {
  requestId: string;
  responseTopic: string;
  resolve: (data: unknown[]) => void;
  reject: (err: Error) => void;
  deadline: number;
};

type Orphan = { body: ResponseEnvelope<unknown>; expiresAt: number };

export class RequestReplyClient {
  private readonly pollMs: number;
  private readonly ttlMs: number;
  private readonly newId: () => string;
  private pending = new Map<string, Pending>();
  private orphans = new Map<string, Orphan>();
  private pollTimer: ReturnType<typeof setInterval> | undefined;
  private polling = false;

  constructor(
    private readonly cgw: CgwClient,
    private readonly ch: {
      requestFqcn: string;
      responseFqcn: string;
      topicOwner: string;
      topicVersion: string;
      pollMs?: number;
      ttlMs?: number;
    },
    ids?: () => string,
  ) {
    this.pollMs = ch.pollMs ?? 100;
    this.ttlMs = ch.ttlMs ?? 60_000;
    this.newId = ids ?? (() => randomUUID());
  }

  async request<P, D>(
    operation: string,
    payload: P,
    opts?: { timeoutMs?: number },
  ): Promise<D[]> {
    const requestId = this.newId();
    const responseTopic = `${operation}Response`;
    const timeoutMs = opts?.timeoutMs ?? 30_000;
    const deadline = Date.now() + timeoutMs;

    const orphan = this.orphans.get(requestId);
    if (orphan && orphan.expiresAt > Date.now()) {
      this.orphans.delete(requestId);
      return this.finish<D>(orphan.body, requestId);
    }

    await this.cgw.send({
      fqcn: this.ch.requestFqcn,
      topicName: operation,
      topicVersion: this.ch.topicVersion,
      topicOwner: this.ch.topicOwner,
      transactionId: requestId,
      payload: {
        requestId,
        operation,
        payload,
      } satisfies RequestEnvelope<P>,
    });

    return new Promise<D[]>((resolve, reject) => {
      this.pending.set(requestId, {
        requestId,
        responseTopic,
        resolve: resolve as (data: unknown[]) => void,
        reject,
        deadline,
      });
      this.ensurePollLoop();
    });
  }

  private ensurePollLoop(): void {
    if (this.pollTimer !== undefined) return;
    this.pollTimer = setInterval(() => {
      void this.pollOnce();
    }, this.pollMs);
    void this.pollOnce();
  }

  private stopPollLoopIfIdle(): void {
    if (this.pending.size > 0) return;
    this.clearPollTimer();
  }

  /** Stop polling and reject any still-pending requests (tests / shutdown). */
  close(): void {
    this.clearPollTimer();
    for (const [, p] of this.pending) {
      p.reject(new EwdsTimeoutError());
    }
    this.pending.clear();
    this.orphans.clear();
  }

  private clearPollTimer(): void {
    if (this.pollTimer !== undefined) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  private async pollOnce(): Promise<void> {
    if (this.polling) return;
    if (this.pending.size === 0) {
      this.stopPollLoopIfIdle();
      return;
    }
    this.polling = true;
    try {
      const now = Date.now();
      for (const [id, orphan] of this.orphans) {
        if (orphan.expiresAt <= now) this.orphans.delete(id);
      }

      for (const [id, p] of this.pending) {
        if (p.deadline <= now) {
          this.pending.delete(id);
          p.reject(new EwdsTimeoutError());
        }
      }

      const messages = await this.cgw.receive({
        fqcn: this.ch.responseFqcn,
        amount: 50,
      });

      for (const message of messages) {
        await this.handleMessage(message);
      }
    } finally {
      this.polling = false;
      this.stopPollLoopIfIdle();
    }
  }

  private async handleMessage(message: CgwMessage): Promise<void> {
    let body: ResponseEnvelope<unknown>;
    try {
      body = JSON.parse(message.payload) as ResponseEnvelope<unknown>;
    } catch {
      return;
    }
    if (!body.requestId) return;

    const pending = [...this.pending.values()].find(
      (p) =>
        p.requestId === body.requestId &&
        message.topicName === p.responseTopic,
    );
    if (pending) {
      this.pending.delete(pending.requestId);
      try {
        const data = await this.finish<unknown>(body, pending.requestId);
        pending.resolve(data);
      } catch (err) {
        pending.reject(err as Error);
      }
      await this.cgw.ack([message.id]);
      return;
    }

    this.orphans.set(body.requestId, {
      body,
      expiresAt: Date.now() + this.ttlMs,
    });
    await this.cgw.ack([message.id]);
  }

  private async finish<D>(
    body: ResponseEnvelope<unknown>,
    requestId: string,
  ): Promise<D[]> {
    if (!body.success) {
      const code =
        typeof body.error === "string"
          ? body.error
          : (body.error?.code ?? "remote_error");
      const msg =
        typeof body.error === "string"
          ? body.error
          : (body.error?.message ?? `EWDS error for ${requestId}`);
      throw new EwdsRemoteError(code, msg);
    }
    return (body.data ?? []) as D[];
  }
}