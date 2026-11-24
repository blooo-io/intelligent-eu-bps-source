import type { CgwClient } from "./cgw-client.js";
import type { InboundMessageStore } from "./inbound-store.js";

export class EwdsTopicConsumer<T> {
  constructor(
    private readonly cgw: CgwClient,
    private readonly store: InboundMessageStore,
    private readonly sub: {
      fqcn: string;
      topicName: string;
      topicOwner: string;
      allowedSenders?: string[];
    },
    private readonly validate?: (x: unknown) => x is T,
  ) {}

  async pull(
    max = 50,
  ): Promise<Array<{ messageId: string; sender: string; body: T }>> {
    const messages = await this.cgw.receive({
      fqcn: this.sub.fqcn,
      topicName: this.sub.topicName,
      topicOwner: this.sub.topicOwner,
      amount: max,
    });

    const out: Array<{ messageId: string; sender: string; body: T }> = [];

    for (const message of messages) {
      if (!message.signatureValid) {
        await this.reject(message);
        continue;
      }
      if (
        this.sub.allowedSenders &&
        !this.sub.allowedSenders.includes(message.sender)
      ) {
        await this.reject(message);
        continue;
      }

      const isNew = await this.store.saveIfNew({
        messageId: message.id,
        topicName: message.topicName,
        sender: message.sender,
        receivedAt: new Date().toISOString(),
        payload: message.payload,
        status: "received",
      });

      await this.cgw.ack([message.id]);

      if (!isNew) continue;

      let body: unknown;
      try {
        body = JSON.parse(message.payload);
      } catch {
        await this.store.mark(message.id, "rejected");
        continue;
      }

      if (this.validate && !this.validate(body)) {
        await this.store.mark(message.id, "rejected");
        continue;
      }

      out.push({ messageId: message.id, sender: message.sender, body: body as T });
    }

    return out;
  }

  async done(messageId: string, ok: boolean): Promise<void> {
    await this.store.mark(messageId, ok ? "processed" : "rejected");
  }

  private async reject(message: { id: string; topicName: string; sender: string; payload: string }): Promise<void> {
    await this.store.saveIfNew({
      messageId: message.id,
      topicName: message.topicName,
      sender: message.sender,
      receivedAt: new Date().toISOString(),
      payload: message.payload,
      status: "rejected",
    });
    await this.cgw.ack([message.id]);
  }
}