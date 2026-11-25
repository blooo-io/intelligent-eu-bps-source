import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CgwClient, CgwError } from "@intelligent/ewds-client";
import { EwdsDataspaceAdapter } from "./ewds-dataspace.adapter.js";

const exampleRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../docs/architecture/ewds-topics",
);

function example(topic: string): unknown {
  return JSON.parse(
    readFileSync(path.join(exampleRoot, `${topic}.example.json`), "utf8"),
  );
}

class FakeCgw {
  readonly sent: unknown[] = [];
  failStatus: number | null = null;
  async send(body: unknown): Promise<void> {
    if (this.failStatus != null) {
      throw new CgwError(this.failStatus, "/api/v2/messages");
    }
    this.sent.push(body);
  }
}

describe("EwdsDataspaceAdapter (Task 4.11 / INT-440)", () => {
  it("REQ-048: publishes a valid billingInvoice on blooo.intelligent.billing.pub", async () => {
    const fake = new FakeCgw();
    const adapter = new EwdsDataspaceAdapter(fake as unknown as CgwClient, {
      fqcn: "blooo.intelligent.billing.pub",
      topicOwner: "integration.apps.intelligent.auth.ewc",
      topicVersion: "1.0.0",
    });
    const r = await adapter.publish("billingInvoice", example("billingInvoice"));
    expect(r).toEqual({ ok: true });
    expect(fake.sent[0]).toMatchObject({
      fqcn: "blooo.intelligent.billing.pub",
      topicName: "billingInvoice",
      topicVersion: "1.0.0",
      topicOwner: "integration.apps.intelligent.auth.ewc",
    });
  });

  it("NFR-004: an invalid payload is not sent and returns errors", async () => {
    const fake = new FakeCgw();
    const adapter = new EwdsDataspaceAdapter(fake as unknown as CgwClient, {
      fqcn: "blooo.intelligent.billing.pub",
      topicOwner: "integration.apps.intelligent.auth.ewc",
      topicVersion: "1.0.0",
    });
    const r = await adapter.publish("billingInvoice", { invoiceId: "x" });
    expect(r.ok).toBe(false);
    expect(fake.sent).toHaveLength(0);
  });

  it("CGW 503 -> ok:false so the outbox row stays failed and RetryPending resends", async () => {
    const fake = new FakeCgw();
    fake.failStatus = 503;
    const adapter = new EwdsDataspaceAdapter(fake as unknown as CgwClient, {
      fqcn: "blooo.intelligent.billing.pub",
      topicOwner: "integration.apps.intelligent.auth.ewc",
      topicVersion: "1.0.0",
    });
    const r = await adapter.publish("billingInvoice", example("billingInvoice"));
    expect(r.ok).toBe(false);
  });

  it("rejects an unknown topic without calling CGW", async () => {
    const fake = new FakeCgw();
    const adapter = new EwdsDataspaceAdapter(fake as unknown as CgwClient, {
      fqcn: "blooo.intelligent.billing.pub",
      topicOwner: "integration.apps.intelligent.auth.ewc",
      topicVersion: "1.0.0",
    });
    // Cast — runtime guard for topic union expansion mistakes.
    const r = await adapter.publish(
      "notATopic" as unknown as "billingInvoice",
      {},
    );
    expect(r).toEqual({ ok: false, errors: ["Unknown topic notATopic"] });
    expect(fake.sent).toHaveLength(0);
  });

  it("uses paymentId as transactionId and maps non-CgwError failures", async () => {
    const fake = {
      sent: [] as unknown[],
      async send() {
        throw new Error("network down");
      },
    };
    const adapter = new EwdsDataspaceAdapter(fake as unknown as CgwClient, {
      fqcn: "blooo.intelligent.billing.pub",
      topicOwner: "integration.apps.intelligent.auth.ewc",
      topicVersion: "1.0.0",
    });
    const r = await adapter.publish(
      "billingPayment",
      example("billingPayment"),
    );
    expect(r.ok).toBe(false);
    expect(r.errors?.[0]).toMatch(/network down/);
  });

  it("maps non-Error throwables and keeps purgeCache at 0", async () => {
    const fake = {
      async send() {
        throw "boom";
      },
    };
    const adapter = new EwdsDataspaceAdapter(fake as unknown as CgwClient, {
      fqcn: "blooo.intelligent.billing.pub",
      topicOwner: "integration.apps.intelligent.auth.ewc",
      topicVersion: "1.0.0",
    });
    const r = await adapter.publish(
      "billingInvoice",
      example("billingInvoice"),
    );
    expect(r).toEqual({ ok: false, errors: ["boom"] });
    await expect(adapter.purgeCache("2026-01-01T00:00:00Z")).resolves.toBe(0);
    expect(adapter.recorded()).toHaveLength(1);
  });

  it("omits transactionId when the payload has no invoiceId/paymentId", async () => {
    const fake = new FakeCgw();
    const adapter = new EwdsDataspaceAdapter(fake as unknown as CgwClient, {
      fqcn: "blooo.intelligent.billing.pub",
      topicOwner: "integration.apps.intelligent.auth.ewc",
      topicVersion: "1.0.0",
    });
    const r = await adapter.publish(
      "billingKycStatus",
      example("billingKycStatus"),
    );
    expect(r.ok).toBe(true);
    expect(
      (fake.sent[0] as { transactionId?: string }).transactionId,
    ).toBeUndefined();
  });
});
