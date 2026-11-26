import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("docs-portal build script (INT-366 / INT-456)", () => {
  it("does not pass the Redocly flag removed in CLI 2.71", () => {
    const source = readFileSync(
      path.join(import.meta.dirname, "build.mjs"),
      "utf8",
    );
    expect(source).toContain('"build-docs"');
    expect(source).not.toContain("--disableGoogleFont");
  });

  it("INT-456: builds webhook OpenAPI, not withdrawn public.v1", () => {
    const source = readFileSync(
      path.join(import.meta.dirname, "build.mjs"),
      "utf8",
    );
    expect(source).toContain("webhooks/payment-provider.v1.yaml");
    expect(source).not.toContain("public.v1.yaml");
  });
});
