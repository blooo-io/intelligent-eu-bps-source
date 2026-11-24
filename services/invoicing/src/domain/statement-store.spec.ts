import { describe, expect, it } from "vitest";
import { StatementStore, type StatementRecord } from "./statement-store.js";

const row = (over: Partial<StatementRecord> = {}): StatementRecord => ({
  statementId: "st-1",
  participantId: "P",
  communityId: "COM",
  period: "2026-10",
  periodFrom: "2026-10-01T00:00:00.000Z",
  periodUntil: "2026-11-01T00:00:00.000Z",
  currency: "EUR",
  totalBought: "0.00",
  totalSold: "1.00",
  netBalance: "1.00",
  direction: "to_receive",
  invoiceIds: ["i1", "i2"],
  status: "Open",
  revision: 1,
  issuedAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
  ...over,
});

describe("StatementStore (REQ-059)", () => {
  it("upsert replaces by statementId and find matches participant, community and period", () => {
    const store = new StatementStore();
    store.upsert(row());
    store.upsert(row({ revision: 2 }));
    expect(store.list()).toHaveLength(1);
    expect(store.find("P", "COM", "2026-10")?.revision).toBe(2);
    expect(store.find("P", "COM", "2026-11")).toBeUndefined();
    expect(store.find("P", "OTHER", "2026-10")).toBeUndefined();
  });

  it("listByInvoice returns the statements that reference an invoice", () => {
    const store = new StatementStore();
    store.upsert(row());
    store.upsert(row({ statementId: "st-2", participantId: "A", invoiceIds: ["i1"] }));
    expect(store.listByInvoice("i1").map((s) => s.statementId).sort()).toEqual(["st-1", "st-2"]);
    expect(store.listByInvoice("i2").map((s) => s.statementId)).toEqual(["st-1"]);
    expect(store.listByInvoice("missing")).toEqual([]);
  });

  it("returns copies, so callers cannot mutate the cache", () => {
    const store = new StatementStore();
    store.upsert(row());
    store.find("P", "COM", "2026-10")!.invoiceIds.push("hacked");
    expect(store.find("P", "COM", "2026-10")!.invoiceIds).toEqual(["i1", "i2"]);
  });

  it("records upserts only while recording", () => {
    const store = new StatementStore();
    store.upsert(row());
    store.beginRecording();
    store.upsert(row({ revision: 2 }));
    expect(store.takeRecording()).toEqual([{ kind: "statement", row: row({ revision: 2 }) }]);
    store.upsert(row({ revision: 3 }));
    expect(store.takeRecording()).toHaveLength(0);
  });

  it("snapshot, restore and reset", () => {
    const store = new StatementStore();
    store.upsert(row());
    const snap = store.snapshot();
    store.reset();
    expect(store.list()).toHaveLength(0);
    store.restore(snap);
    expect(store.listByParticipant(["P", "A"])).toHaveLength(1);
  });
});
