import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildOperationPath,
  operationById,
  PUBLIC_OPERATIONS,
} from "./public-operations";

describe("PUBLIC_OPERATIONS (INT-387 / REQ-052)", () => {
  it("lists every operationId in the public contract", () => {
    const yaml = readFileSync(
      path.resolve(process.cwd(), "../../contracts/openapi/public.v1.yaml"),
      "utf8",
    );
    const ids = [...yaml.matchAll(/^      operationId: (\w+)/gm)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(0);
    expect(PUBLIC_OPERATIONS.map((op) => op.operationId)).toEqual(ids);
  });

  it("substitutes path params and skips an empty optional query", () => {
    const op = operationById("listDiscrepancies");
    expect(op).toBeDefined();
    expect(buildOperationPath(op!, {})).toEqual({
      path: "/v1/reconciliation/discrepancies",
    });
    expect(buildOperationPath(op!, { communityId: "c-1" })).toEqual({
      path: "/v1/reconciliation/discrepancies?communityId=c-1",
    });
  });

  it("reports a missing required path or query param", () => {
    const invoice = operationById("getInvoice")!;
    expect(buildOperationPath(invoice, {})).toEqual({ error: "Missing id" });
    expect(buildOperationPath(invoice, { id: "inv 1" }).path).toBe(
      "/v1/invoices/inv%201",
    );
    const summary = operationById("getPeriodicSummary")!;
    expect(buildOperationPath(summary, { communityId: "c" })).toEqual({
      error: "Missing period",
    });
  });
});
