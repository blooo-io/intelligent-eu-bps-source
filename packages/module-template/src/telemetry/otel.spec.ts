import { describe, expect, it } from "vitest";
import { getMeter, getTracer, startModuleSpan } from "./otel.js";

describe("OpenTelemetry accessors", () => {
  it("returns a tracer and meter for the module", () => {
    expect(getTracer("participants")).toBeTruthy();
    expect(getMeter("participants")).toBeTruthy();
  });

  it("starts a span that can be ended", () => {
    const span = startModuleSpan("participants", "health.check");
    expect(span.isRecording()).toBeTypeOf("boolean");
    span.end();
  });
});
