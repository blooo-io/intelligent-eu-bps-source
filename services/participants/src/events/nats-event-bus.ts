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

/** INT-275 — NATS JetStream / core subscribe for ErasureRequested. */
export class NatsEventBus implements EventBusPort {
  private nc: NatsConnection | null = null;
  private readonly subs: Subscription[] = [];
  private readonly consumers: ConsumerMessages[] = [];

  constructor(
    private readonly url: string,
    private readonly subjectPrefix = "intelligent.dev",
    private readonly stream?: string,
    private readonly consumerPrefix = "participants",
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

  async close(): Promise<void> {
    for (const s of this.subs) s.unsubscribe();
    for (const c of this.consumers) c.stop();
    if (this.nc) {
      await this.nc.drain();
      this.nc = null;
    }
  }

  private async bindJetStream(
    nc: NatsConnection,
    fullSubject: string,
    durableSuffix: string,
    handler: EventHandler,
  ): Promise<void> {
    const durable = `${this.consumerPrefix}-${durableSuffix}`.replace(
      /[^a-zA-Z0-9_-]/g,
      "-",
    );
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

  private async ensureConnected(): Promise<NatsConnection> {
    if (!this.nc) {
      this.nc = await connect({ servers: this.url });
    }
    return this.nc;
  }
}

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
