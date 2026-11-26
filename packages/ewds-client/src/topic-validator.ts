import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
// Named import: NodeNext default-import of ajv CJS types is not constructable.
import { Ajv2020, type ErrorObject } from "ajv/dist/2020.js";
import type { Plugin } from "ajv";

export type EwdsTopicName =
  | "actor"
  | "billingStatement"
  | "billingInvoice"
  | "billingPayment"
  | "billingPayout"
  | "billingKycStatus"
  | "billingCommandRequest"
  | "billingCommandReply";

const pkgRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

// createRequire: ajv-formats CJS default is not callable under NodeNext typecheck.
const require = createRequire(import.meta.url);
const addFormats = require("ajv-formats") as Plugin<unknown>;

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

const validators = new Map<
  EwdsTopicName,
  ReturnType<typeof ajv.compile>
>();

function loadValidator(topic: EwdsTopicName) {
  let v = validators.get(topic);
  if (!v) {
    const schema = JSON.parse(
      readFileSync(
        path.join(pkgRoot, "schemas", `${topic}.v1.0.0.schema.json`),
        "utf8",
      ),
    );
    v = ajv.compile(schema);
    validators.set(topic, v);
  }
  return v;
}

export function createTopicValidator(
  topic: EwdsTopicName,
): (x: unknown) => { ok: boolean; errors: string[] } {
  const validate = loadValidator(topic);
  return (x: unknown) => {
    const ok = validate(x);
    if (ok) return { ok: true, errors: [] };
    return {
      ok: false,
      errors: (validate.errors ?? []).map(
        (e: ErrorObject) =>
          `${e.instancePath || "/"} ${e.message ?? "invalid"}`,
      ),
    };
  };
}
