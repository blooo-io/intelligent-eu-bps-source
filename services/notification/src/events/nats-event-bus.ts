import {
  AckPolicy,
  connect,
  DeliverPolicy,
  type ConsumerMessages,
  type JetStreamClient,
  type NatsConnection,
  type Subscription,
} from "nats";
import type { EventBusPort, EventHandler } from "./event-bus.port.js";
import { InMemoryEventBus } from "./in-memory-event-bus.js";

/**
 * INT-217 — NATS JetStream (preferred) / core subscribe for PaymentStatusChanged (TD-7).
 * Subject: `{prefix}.{eventType}` (default `intelligent.dev.PaymentStatusChanged`).
 * When `NATS_STREAM` is set, binds a durable JetStream consumer (Debezium sink).
 */
export class NatsEventBus implements EventBusPort {
  private nc: NatsConnection | null = null;
  private connecting: Promise<NatsConnection> | null = null;
  private readonly subs: Subscription[] = [];
  private readonly consumers: ConsumerMessages[] = [];

  constructor(
    private readonly url: string,
    private readonly subjectPrefix = "intelligent.dev",
    private readonly stream?: string,
  ) {}

  async subscribe(subject: string, handler: EventHandler): Promise<void> {
    const nc = await this.ensureConnected();
    const full = `${this.subjectPrefix}.${subject}`;
    if (this.stream) {
      await this.bindJetStream(nc, full, subject, handler);
      return;
    }
    const sub = nc.subscribe(full);
    this.subs.push(sub);
    (async () => {
      for await (const msg of sub) {
        await this.dispatch(handler, msg.string());
      }
    })().catch(() => {
      /* subscription ended */
    });
  }

  async publish(subject: string, payload: unknown): Promise<void> {
    const nc = await this.ensureConnected();
    const data = JSON.stringify(payload);
    const full = `${this.subjectPrefix}.${subject}`;
    if (this.stream) {
      const js = nc.jetstream();
      await js.publish(full, data);
      return;
    }
    nc.publish(full, data);
  }

  async close(): Promise<void> {
    for (const s of this.subs) s.unsubscribe();
    for (const c of this.consumers) c.stop();
    if (this.nc) {
      await this.nc.drain();
      this.nc = null;
    }
    this.connecting = null;
  }

  private async bindJetStream(
    nc: NatsConnection,
    fullSubject: string,
    durableSuffix: string,
    handler: EventHandler,
  ): Promise<void> {
    const durable = `notification-${durableSuffix}`.replace(/[^a-zA-Z0-9_-]/g, "-");
    const jsm = await nc.jetstreamManager();
    try {
      await jsm.consumers.add(this.stream!, {
        durable_name: durable,
        filter_subject: fullSubject,
        ack_policy: AckPolicy.Explicit,
        deliver_policy: DeliverPolicy.All,
      });
    } catch {
      /* consumer already exists */
    }
    const js: JetStreamClient = nc.jetstream();
    const consumer = await js.consumers.get(this.stream!, durable);
    const messages = await consumer.consume();
    this.consumers.push(messages);
    (async () => {
      for await (const msg of messages) {
        try {
          await this.dispatch(handler, msg.string());
          msg.ack();
        } catch {
          msg.nak();
        }
      }
    })().catch(() => {
      /* consumer ended */
    });
  }

  private async dispatch(handler: EventHandler, raw: string): Promise<void> {
    let payload: unknown = raw;
    try {
      payload = JSON.parse(raw);
    } catch {
      /* keep raw string */
    }
    await handler(payload);
  }

  private ensureConnected(): Promise<NatsConnection> {
    const user = process.env.NATS_USER;
    const pass = process.env.NATS_PASSWORD;
    // INT-382 — Nest runs onModuleInit hooks concurrently; every subscriber shares one connection.
    this.connecting ??= connect({
      // INT-338 — authenticate when the broker account is configured. CI leaves both unset.
      servers: this.url,
      ...(user ? { user, pass: pass ?? "" } : {}),
    }).then(
      (nc) => {
        this.nc = nc;
        return nc;
      },
      (err: unknown) => {
        this.connecting = null;
        throw err;
      },
    );
    return this.connecting;
  }
}

/** Prefer NATS when NATS_URL is set; otherwise in-memory (CI). */
export function createEventBus(env: NodeJS.ProcessEnv = process.env): EventBusPort {
  const url = env.NATS_URL ?? env.NATS_URLS;
  if (url) {
    return new NatsEventBus(
      url,
      env.NATS_SUBJECT_PREFIX ?? "intelligent.dev",
      env.NATS_STREAM || undefined,
    );
  }
  return new InMemoryEventBus();
}
