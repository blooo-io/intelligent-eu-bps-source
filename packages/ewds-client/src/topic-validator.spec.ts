import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createTopicValidator } from "./topic-validator.js";

const pkgRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const docsRoot = path.resolve(pkgRoot, "../../docs/architecture/ewds-topics");

const topics = [
  "billingStatement",
  "billingInvoice",
  "billingPayment",
  "billingPayout",
  "billingKycStatus",
  "billingCommandRequest",
  "billingCommandReply",
] as const;

describe("createTopicValidator", () => {
  it("schemas/ copies are byte-identical to docs/architecture/ewds-topics", async () => {
    for (const name of topics) {
      const file = `${name}.v1.0.0.schema.json`;
      const docs = await readFile(path.join(docsRoot, file), "utf8");
      const pkg = await readFile(path.join(pkgRoot, "schemas", file), "utf8");
      expect(pkg).toEqual(docs);
    }
  });

  it("loads each billing topic schema", () => {
    for (const topic of topics) {
      const v = createTopicValidator(topic);
      expect(v({})).toMatchObject({ ok: false });
    }
  });

  it("rejects payloads that violate billingInvoice schema", async () => {
    const v = createTopicValidator("billingInvoice");
    const example = JSON.parse(
      await readFile(
        path.join(docsRoot, "billingInvoice.example.json"),
        "utf8",
      ),
    );
    expect(v(example).ok).toBe(true);
    const bad = { ...example, issuerStatementId: undefined };
    expect(v(bad).ok).toBe(false);
    expect(v(bad).errors.length).toBeGreaterThan(0);
  });
});