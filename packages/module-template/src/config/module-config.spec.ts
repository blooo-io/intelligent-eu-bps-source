import { describe, expect, it } from "vitest";
import { loadModuleConfig } from "./module-config.js";

const validEnv = {
  MODULE_NAME: "participants",
  PORT: "3001",
  DATABASE_URL: "postgres://app:secret@localhost:5432/participants",
  KEYCLOAK_ISSUER_URL: "https://auth.example/realms/int",
  KEYCLOAK_AUDIENCE: "billing-api",
};

describe("loadModuleConfig", () => {
  it("loads typed configuration from the environment", () => {
    const config = loadModuleConfig(validEnv);
    expect(config.moduleName).toBe("participants");
    expect(config.port).toBe(3001);
    expect(config.billingMode).toBe("virtual");
  });

  it("rejects a missing MODULE_NAME", () => {
    expect(() =>
      loadModuleConfig({ ...validEnv, MODULE_NAME: undefined }),
    ).toThrow();
  });

  it("defaults billing mode to virtual for V1 (BR-12)", () => {
    const { BILLING_MODE: _ignored, ...withoutMode } = validEnv;
    expect(loadModuleConfig(withoutMode).billingMode).toBe("virtual");
  });
});
