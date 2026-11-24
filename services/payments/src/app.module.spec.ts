import "reflect-metadata";
import { afterEach, describe, expect, it } from "vitest";
import { NestFactory } from "@nestjs/core";
import type { INestApplication } from "@nestjs/common";
import { AppModule } from "./app.module.js";
import {
  HttpInvoiceLookup,
  InMemoryInvoiceLookup,
  INVOICE_LOOKUP,
} from "./ports/invoice-lookup.port.js";
import {
  HttpParticipantsNotifier,
  NoopParticipantsNotifier,
  PARTICIPANTS_NOTIFIER,
} from "./ports/participants-notifier.port.js";
import {
  HttpParticipantsResolver,
  NoopParticipantsResolver,
  PARTICIPANTS_RESOLVER,
} from "./ports/participants-resolver.port.js";
import {
  HttpStatementLookup,
  InMemoryStatementLookup,
  STATEMENT_LOOKUP,
} from "./ports/statement-lookup.port.js";
import { COLLECT_PORT } from "./psp/collect.port.js";
import { KYC_ONBOARDING_PORT } from "./psp/kyc-onboarding.port.js";
import { MockPspAdapter } from "./psp/mock-psp.adapter.js";
import { PAYOUT_PORT } from "./psp/payout.port.js";
import { PSP_ADAPTER, PSP_EVENTS_PORT } from "./psp/psp-events.port.js";
import { StripePspAdapter } from "./psp/stripe-psp.adapter.js";

describe("AppModule factories (INT-193)", () => {
  let app: INestApplication | undefined;
  const saved = {
    INVOICING_INTERNAL_URL: process.env.INVOICING_INTERNAL_URL,
    PARTICIPANTS_INTERNAL_URL: process.env.PARTICIPANTS_INTERNAL_URL,
    SERVICE_AUTH_TOKEN: process.env.SERVICE_AUTH_TOKEN,
    INTERNAL_SERVICE_TOKEN: process.env.INTERNAL_SERVICE_TOKEN,
    PSP_PROVIDER: process.env.PSP_PROVIDER,
    stripe_secret_key: process.env.stripe_secret_key,
    stripe_webhook_secret: process.env.stripe_webhook_secret,
  };

  afterEach(async () => {
    if (app) await app.close();
    app = undefined;
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  async function boot(): Promise<INestApplication> {
    app = await NestFactory.create(AppModule, { logger: false });
    await app.init();
    return app;
  }

  it("AD-6 one PSP adapter instance backs all neutral ports [INT-424]", async () => {
    delete process.env.PSP_PROVIDER;
    delete process.env.INVOICING_INTERNAL_URL;
    delete process.env.PARTICIPANTS_INTERNAL_URL;
    const nest = await boot();
    const k = nest.get(KYC_ONBOARDING_PORT);
    expect(nest.get(COLLECT_PORT)).toBe(k);
    expect(nest.get(PAYOUT_PORT)).toBe(k);
    expect(nest.get(PSP_EVENTS_PORT)).toBe(k);
    expect(k).toBeInstanceOf(MockPspAdapter);
  });

  it("defaults to in-memory invoice lookup and noop notifier", async () => {
    delete process.env.INVOICING_INTERNAL_URL;
    delete process.env.PARTICIPANTS_INTERNAL_URL;
    delete process.env.PSP_PROVIDER;
    const nest = await boot();
    expect(nest.get(INVOICE_LOOKUP)).toBeInstanceOf(InMemoryInvoiceLookup);
    expect(nest.get(STATEMENT_LOOKUP)).toBeInstanceOf(InMemoryStatementLookup);
    expect(nest.get(PARTICIPANTS_NOTIFIER)).toBeInstanceOf(NoopParticipantsNotifier);
    expect(nest.get(PARTICIPANTS_RESOLVER)).toBeInstanceOf(NoopParticipantsResolver);
    expect(nest.get(PSP_ADAPTER)).toBeInstanceOf(MockPspAdapter);
  });

  it("wires HTTP invoice lookup and participants notifier from env", async () => {
    process.env.INVOICING_INTERNAL_URL = "http://invoicing:8080";
    process.env.PARTICIPANTS_INTERNAL_URL = "http://participants:8080";
    process.env.SERVICE_AUTH_TOKEN = "svc-from-env";
    delete process.env.PSP_PROVIDER;
    const nest = await boot();
    expect(nest.get(INVOICE_LOOKUP)).toBeInstanceOf(HttpInvoiceLookup);
    expect(nest.get(STATEMENT_LOOKUP)).toBeInstanceOf(HttpStatementLookup);
    expect(nest.get(PARTICIPANTS_NOTIFIER)).toBeInstanceOf(HttpParticipantsNotifier);
    expect(nest.get(PARTICIPANTS_RESOLVER)).toBeInstanceOf(HttpParticipantsResolver);
  });

  it("selects StripePspAdapter when PSP_PROVIDER=stripe (AD-6)", async () => {
    process.env.PSP_PROVIDER = "stripe";
    process.env.stripe_secret_key = "sk_test_factory_module";
    process.env.stripe_webhook_secret = "whsec_factory";
    delete process.env.INVOICING_INTERNAL_URL;
    delete process.env.PARTICIPANTS_INTERNAL_URL;
    const nest = await boot();
    expect(nest.get(PSP_ADAPTER)).toBeInstanceOf(StripePspAdapter);
  });
});
