import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { isDirectRun, resolvePort } from "./port.js";

describe("mock-cgw port helpers (INT-454)", () => {
  it("resolvePort defaults to 8080", () => {
    expect(resolvePort(undefined)).toBe(8080);
    expect(resolvePort("")).toBe(8080);
    expect(resolvePort("0")).toBe(8080);
    expect(resolvePort("-1")).toBe(8080);
    expect(resolvePort("9090")).toBe(9090);
  });

  it("isDirectRun compares file URLs", () => {
    const argv = "/app/dist/main.js";
    expect(isDirectRun(pathToFileURL(argv).href, undefined)).toBe(false);
    expect(isDirectRun(pathToFileURL(argv).href, argv)).toBe(true);
    expect(isDirectRun("file:///other.js", argv)).toBe(false);
  });
});
