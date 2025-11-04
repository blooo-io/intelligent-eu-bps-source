/**
 * P-DS mock — validates billingInvoice / billingPayment against draft EWDS schemas (REQ-048).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
// CJS interop: ajv / ajv-formats ship dual packages; require keeps tsc + Node happy.
const Ajv2020 = require("ajv/dist/2020.js") as new (opts?: object) => {
  compile: (schema: object) => ((data: unknown) => boolean) & {
    errors?: Array<{ instancePath?: string; message?: string }>;
  };
};
const addFormats = require("ajv-formats") as (ajv: unknown) => unknown;import type {
  DataSpacePort,
  DataSpaceTopic,
  PublishResult,
} from "../types.js";

// Schemas live in-package so Docker builds need not copy docs/ (.dockerignore).
const topicsRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../schemas",
);

function loadSchema(name: string): object {
  return JSON.parse(
    readFileSync(path.join(topicsRoot, name), "utf8"),
  ) as object;
}

export function createMockDataSpace(): DataSpacePort {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const validators = {
    billingInvoice: ajv.compile(
      loadSchema("billingInvoice.v1.0.0.schema.json"),
    ),
    billingPayment: ajv.compile(
      loadSchema("billingPayment.v1.0.0.schema.json"),
    ),
  };
  const log: Array<{ topic: DataSpaceTopic; message: unknown }> = [];

  return {
    publish(topic: DataSpaceTopic, message: unknown): PublishResult {
      const validate = validators[topic];
      if (!validate) {
        return { ok: false, errors: [`Unknown topic ${topic}`] };
      }
      const ok = validate(message);
      if (!ok) {
        return {
          ok: false,
          errors: (validate.errors ?? []).map(
            (e) => `${e.instancePath || "/"} ${e.message ?? "invalid"}`,
          ),
        };
      }
      log.push({ topic, message });
      return { ok: true };
    },
    purgeCache(before: string): number {
      const beforeMs = Date.parse(before);
      const remaining = log.filter((entry) => {
        const msg = entry.message as { updatedAt?: string };
        if (!msg.updatedAt) return true;
        return Date.parse(msg.updatedAt) >= beforeMs;
      });
      const removed = log.length - remaining.length;
      log.length = 0;
      log.push(...remaining);
      return removed;
    },
    recorded() {
      return log;
    },
  };
}
