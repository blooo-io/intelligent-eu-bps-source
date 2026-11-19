import "reflect-metadata";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NestFactory } from "@nestjs/core";
import type { INestApplication } from "@nestjs/common";
import { AppModule } from "./app.module.js";
import { IntakeService } from "./intake/intake.service.js";
import { FixturePartyResolver } from "./party/fixture-party-resolver.js";
import { HttpPartyResolver } from "./party/http-party-resolver.js";
import { PARTY_RESOLVER } from "./party/party-resolver.port.js";

describe("AppModule (INT-232 / INT-237)", () => {
  let app: INestApplication | undefined;
  const saved = {
    PARTICIPANTS_INTERNAL_URL: process.env.PARTICIPANTS_INTERNAL_URL,
    INTAKE_BOOTSTRAP_S1: process.env.INTAKE_BOOTSTRAP_S1,
    intake_bootstrap_s1: process.env.intake_bootstrap_s1,
  };

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  async function boot(): Promise<INestApplication> {
    app = await NestFactory.create(AppModule, { logger: false });
    await app.init();
    return app;
  }

  it("selects HttpPartyResolver when PARTICIPANTS_INTERNAL_URL is set", async () => {
    process.env.PARTICIPANTS_INTERNAL_URL = "http://participants:8080";
    const nest = await boot();
    expect(nest.get(PARTY_RESOLVER)).toBeInstanceOf(HttpPartyResolver);
  });

  it("defaults to FixturePartyResolver without participants URL", async () => {
    delete process.env.PARTICIPANTS_INTERNAL_URL;
    const nest = await boot();
    expect(nest.get(PARTY_RESOLVER)).toBeInstanceOf(FixturePartyResolver);
  });

  it("skips S1 bootstrap when INTAKE_BOOTSTRAP_S1 is false", async () => {
    process.env.INTAKE_BOOTSTRAP_S1 = "false";
    const nest = await boot();
    const intake = nest.get(IntakeService);
    expect(intake.resetStore).toBeDefined();
    expect(nest.get(PARTY_RESOLVER)).toBeDefined();
  });

  it("logs bootstrap failures without crashing boot", async () => {
    delete process.env.INTAKE_BOOTSTRAP_S1;
    const nest = await NestFactory.create(AppModule, { logger: false });
    const intake = nest.get(IntakeService);
    vi.spyOn(intake, "bootstrapS1Window").mockRejectedValue("bootstrap failed");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await nest.init();
    expect(
      logSpy.mock.calls.some(
        (call) =>
          typeof call[0] === "string" &&
          call[0].includes("INTAKE_BOOTSTRAP_S1_failed"),
      ),
    ).toBe(true);
    logSpy.mockRestore();
    await nest.close();
  });
});