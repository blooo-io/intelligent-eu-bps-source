import { describe, expect, it } from "vitest";
import { ModuleTemplateModule } from "./module-template.module.js";
import { MODULE_NAME, OUTBOX_STORE } from "./module-template.tokens.js";
import { OutboxService } from "./outbox/outbox.service.js";
import { IdempotentConsumer } from "./consumer/idempotent-consumer.js";

describe("ModuleTemplateModule", () => {
  it("registers health, outbox and consumer providers for a module", () => {
    const dynamic = ModuleTemplateModule.forRoot({ moduleName: "payments" });
    expect(dynamic.module).toBe(ModuleTemplateModule);
    expect(dynamic.exports).toEqual(
      expect.arrayContaining([OutboxService, IdempotentConsumer, MODULE_NAME]),
    );
    const providers = dynamic.providers ?? [];
    const tokens = providers.map((provider) =>
      typeof provider === "object" && provider && "provide" in provider
        ? provider.provide
        : provider,
    );
    expect(tokens).toEqual(
      expect.arrayContaining([MODULE_NAME, OUTBOX_STORE, OutboxService]),
    );

    // Exercise the factories so the wiring stays covered without a Nest test app.
    for (const provider of providers) {
      if (
        typeof provider === "object" &&
        provider &&
        "useFactory" in provider &&
        typeof provider.useFactory === "function"
      ) {
        const inject = "inject" in provider ? (provider.inject ?? []) : [];
        const args = inject.map((token) => {
          if (token === OUTBOX_STORE) {
            const storeProvider = providers.find(
              (candidate) =>
                typeof candidate === "object" &&
                candidate &&
                "provide" in candidate &&
                candidate.provide === OUTBOX_STORE,
            ) as { useValue: unknown };
            return storeProvider.useValue;
          }
          if (token === MODULE_NAME) return "payments";
          const processed = providers.find(
            (candidate) =>
              typeof candidate === "object" &&
              candidate &&
              "provide" in candidate &&
              candidate.provide === token,
          ) as { useValue?: unknown } | undefined;
          return processed?.useValue;
        });
        expect(provider.useFactory(...args)).toBeTruthy();
      }
    }
  });
});
