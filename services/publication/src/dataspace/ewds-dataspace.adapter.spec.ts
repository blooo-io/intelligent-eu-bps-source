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
});
