/**
 * P-DS live adapter — publish billing records via DDHub Client Gateway (Task 4.11 / INT-440).
 * Validates against the EWDS schema before send; never posts invalid payloads (NFR-004).
 */
import {
  CgwClient,
  CgwError,
  createTopicValidator,
  type EwdsTopicName,
} from "@intelligent/ewds-client";
import type {
  DataSpacePort,
  DataSpaceTopic,
  PublishResult,
} from "@intelligent/mocks";

export type EwdsDataspaceOpts = {
  fqcn: string;
  topicOwner: string;
  topicVersion: string;
};

const RECORD_TOPICS = new Set<DataSpaceTopic>([
  "billingStatement",
  "billingInvoice",
  "billingPayment",
  "billingPayout",
  "billingKycStatus",
]);

export class EwdsDataspaceAdapter implements DataSpacePort {
  /** Test seam — messages accepted for send. */
  readonly sent: Array<{
    fqcn: string;
    topicName: string;
    topicVersion: string;
    topicOwner: string;
    transactionId?: string;
    payload: unknown;
  }> = [];

  constructor(
    private readonly cgw: CgwClient,
    private readonly opts: EwdsDataspaceOpts,
  ) {}

  async publish(topic: DataSpaceTopic, message: unknown): Promise<PublishResult> {
    if (!RECORD_TOPICS.has(topic)) {
      return { ok: false, errors: [`Unknown topic ${topic}`] };
    }
    const validate = createTopicValidator(topic as EwdsTopicName);
    const check = validate(message);
    if (!check.ok) {
      // NFR-004 — never send an invalid payload to the gateway.
      return { ok: false, errors: check.errors };
    }
    const aggregateId =
      typeof message === "object" &&
      message !== null &&
      "invoiceId" in message &&
      typeof (message as { invoiceId?: unknown }).invoiceId === "string"
        ? (message as { invoiceId: string }).invoiceId
        : typeof message === "object" &&
            message !== null &&
            "paymentId" in message &&
            typeof (message as { paymentId?: unknown }).paymentId === "string"
          ? (message as { paymentId: string }).paymentId
          : undefined;
    try {
      const envelope = {
        fqcn: this.opts.fqcn,
        topicName: topic,
        topicVersion: this.opts.topicVersion,
        topicOwner: this.opts.topicOwner,
        transactionId: aggregateId,
        payload: message,
      };
      this.sent.push(envelope);
      await this.cgw.send(envelope);
      return { ok: true };
    } catch (err) {
      // CGW 5xx → ok:false so the outbox row stays failed for RetryPending.
      if (err instanceof CgwError) {
        return { ok: false, errors: [err.message] };
      }
      return {
        ok: false,
        errors: [err instanceof Error ? err.message : String(err)],
      };
    }
  }

  /** CGW keeps no Billing-owned outbound copy — local purge stays in PublicationStore. */
  async purgeCache(_before: string): Promise<number> {
    return 0;
  }

  recorded() {
    return this.sent.map((s) => ({
      topic: s.topicName as DataSpaceTopic,
      message: s.payload,
    }));
  }
}
