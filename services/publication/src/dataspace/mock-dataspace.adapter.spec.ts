import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MockDataspaceAdapter } from "./mock-dataspace.adapter.js";

const exampleRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../docs/architecture/ewds-topics",
);

describe("MockDataspaceAdapter", () => {
  it("delegates publish, recorded and purgeCache", async () => {
    const adapter = new MockDataspaceAdapter();
    const invoice = JSON.parse(
      readFileSync(path.join(exampleRoot, "billingInvoice.example.json"), "utf8"),
    );
    await expect(adapter.publish("billingInvoice", invoice)).resolves.toEqual({
      ok: true,
    });
    expect(adapter.recorded()).toHaveLength(1);
    await expect(
      adapter.purgeCache("2099-01-01T00:00:00Z"),
    ).resolves.toBeGreaterThanOrEqual(0);
  });
});
