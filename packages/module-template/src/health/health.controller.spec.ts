import { describe, expect, it } from "vitest";
import { HealthController } from "./health.controller.js";

describe("HealthController", () => {
  it("returns ok with the module name", () => {
    const controller = new HealthController("settlement");
    expect(controller.check()).toEqual({
      status: "ok",
      module: "settlement",
    });
  });
});
