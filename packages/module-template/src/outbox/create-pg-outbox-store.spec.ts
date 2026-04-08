import { describe, expect, it } from "vitest";
import { InMemoryOutboxStore } from "./outbox.types.js";
import { defaultOutboxStore } from "./create-pg-outbox-store.js";

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
