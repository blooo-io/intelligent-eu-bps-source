import { describe, expect, it } from "vitest";
import { InMemoryOutboxStore } from "./outbox.types.js";
import {
  defaultOutboxStore,
  defaultProcessedEventsStore,
} from "./create-pg-outbox-store.js";

describe("defaultProcessedEventsStore (INT-339)", () => {
  it("stays in memory without DATABASE_URL", () => {
    expect(defaultProcessedEventsStore({}).constructor.name).toBe(
      "InMemoryProcessedEventsStore",
    );
  });

  it("uses Postgres when DATABASE_URL is set", () => {
    expect(
      defaultProcessedEventsStore({
        DATABASE_URL: "postgresql://u:p@localhost:5432/reporting",
      }).constructor.name,
    ).toBe("PostgresProcessedEventsStore");
  });
});

describe("defaultOutboxStore (INT-213)", () => {
  it("returns in-memory when DATABASE_URL is unset", () => {
    const store = defaultOutboxStore({});
    expect(store).toBeInstanceOf(InMemoryOutboxStore);
  });

  it("returns Postgres-backed store when DATABASE_URL is set", () => {
    const store = defaultOutboxStore({
      DATABASE_URL: "postgresql://u:p@localhost:5432/settlement",
    });
    expect(store.constructor.name).toBe("PostgresOutboxStore");
  });
});
