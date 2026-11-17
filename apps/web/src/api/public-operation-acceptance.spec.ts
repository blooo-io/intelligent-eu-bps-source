import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ACCEPTED_STATUSES,
  UNDOCUMENTED_ACCEPTED_STATUSES,
} from "./public-operation-acceptance";
import { PUBLIC_OPERATIONS } from "./public-operations";

function contractStatuses(yaml: string): Map<string, number[]> {
  const map = new Map<string, number[]>();
  for (const part of yaml.split(/^      operationId: /m).slice(1)) {
    const id = part.slice(0, part.indexOf("\n")).trim();
    const body = part.split(/^  \//m)[0] ?? part;
    const codes = [...body.matchAll(/^        '(\d{3})':/gm)].map((match) =>
      Number(match[1]),
    );
    map.set(id, codes);
  }
  return map;
}

describe("public operation acceptance (INT-394 / REQ-052)", () => {
  it("covers every contract operation and only documented statuses plus named gaps", () => {
    const yaml = readFileSync(
      path.resolve(process.cwd(), "../../contracts/openapi/public.v1.yaml"),
      "utf8",
    );
    const contract = contractStatuses(yaml);
    const ids = PUBLIC_OPERATIONS.map((operation) => operation.operationId);
    expect(Object.keys(ACCEPTED_STATUSES).sort()).toEqual([...ids].sort());
    expect(contract.size).toBe(ids.length);

    for (const id of ids) {
      const accepted = ACCEPTED_STATUSES[id] ?? [];
      expect(accepted.length).toBeGreaterThan(0);
      expect(accepted).not.toContain(401);
      expect(accepted).not.toContain(403);
      const documented = new Set(contract.get(id));
      expect(documented.size).toBeGreaterThan(0);
      const extras = accepted.filter((code) => !documented.has(code));
      expect(extras).toEqual([...(UNDOCUMENTED_ACCEPTED_STATUSES[id] ?? [])]);
    }

    for (const [id, codes] of Object.entries(UNDOCUMENTED_ACCEPTED_STATUSES)) {
      expect(ids).toContain(id);
      for (const code of codes) {
        expect(ACCEPTED_STATUSES[id]).toContain(code);
        expect(contract.get(id)).not.toContain(code);
      }
    }
  });
});
