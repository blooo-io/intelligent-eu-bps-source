import { describe, expect, it } from "vitest";
import {
  assertFullOperationCoverage,
  operationCoverage,
} from "./operation-coverage";

describe("operationCoverage (INT-394 / REQ-052)", () => {
  const expected = ["getMe", "putMyProfile"];
  const accepted = { getMe: [200], putMyProfile: [200] };

  it("is 100% when every operation returned a documented status", () => {
    const report = operationCoverage(
      expected,
      [
        { operationId: "getMe", status: 200 },
        { operationId: "putMyProfile", status: 200 },
      ],
      accepted,
    );
    expect(report).toMatchObject({
      total: 2,
      covered: 2,
      percent: 100,
      missing: [],
      unexpected: [],
    });
    expect(() => assertFullOperationCoverage(report)).not.toThrow();
  });

  it("does not count a status the contract does not document", () => {
    const report = operationCoverage(
      expected,
      [
        { operationId: "getMe", status: 500 },
        { operationId: "putMyProfile", status: 200 },
      ],
      accepted,
    );
    expect(report.covered).toBe(1);
    expect(report.percent).toBe(50);
    expect(report.missing).toEqual(["getMe"]);
    expect(() => assertFullOperationCoverage(report)).toThrow(/getMe/);
  });

  it("keeps the last call for an operation and flags unknown ids", () => {
    const report = operationCoverage(
      expected,
      [
        { operationId: "getMe", status: 401 },
        { operationId: "getMe", status: 200 },
        { operationId: "notInContract", status: 200 },
      ],
      accepted,
    );
    expect(report.calls).toEqual([{ operationId: "getMe", status: 200 }]);
    expect(report.missing).toEqual(["putMyProfile"]);
    expect(report.unexpected).toEqual(["notInContract"]);
    expect(() => assertFullOperationCoverage(report)).toThrow(/notInContract/);
  });

  it("treats an operation with no accepted statuses as uncovered", () => {
    const report = operationCoverage(
      ["getMe"],
      [{ operationId: "getMe", status: 200 }],
      {},
    );
    expect(report.missing).toEqual(["getMe"]);
    expect(report.percent).toBe(0);
  });

  it("floors the percent so one miss cannot round up to 100", () => {
    const report = operationCoverage(
      ["a", "b", "c"],
      [
        { operationId: "a", status: 200 },
        { operationId: "b", status: 200 },
      ],
      { a: [200], b: [200], c: [200] },
    );
    expect(report.percent).toBe(66.6);
    expect(report.covered).toBe(2);
  });

  it("rejects an empty catalogue so a parse failure cannot pass", () => {
    const report = operationCoverage([], [], {});
    expect(report.percent).toBe(100);
    expect(() => assertFullOperationCoverage(report)).toThrow(/0\/0/);
  });
});
