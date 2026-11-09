import { describe, expect, it } from "vitest";
import { decidePairBalance } from "./carry.js";
import { SettlementStore } from "./store.js";

describe("decidePairBalance (BR-04, BR-05, REQ-056)", () => {
  it("nets a reversed period against the carried balance instead of adding it", () => {
    // Period 1: low owed high 3.00 (carried). Period 2: high owes low 2.00.
    const d = decidePairBalance({ low: "a", high: "b", energy: -2, carriedIn: 3 }, 5, false);
    expect(d.consumerId).toBe("a");
    expect(d.producerId).toBe("b");
    expect(d.gross).toBe(1);
    expect(d.invoiced).toBe(0);
    expect(d.carriedInOriented).toBe(3);
    expect(d.carriedOutOriented).toBe(1);
    expect(d.carriedOutCanonical).toBe(1);
  });

  it("flips the invoice direction when the reversal exceeds the carried balance", () => {
    const d = decidePairBalance({ low: "a", high: "b", energy: -9, carriedIn: 3 }, 5, false);
    expect(d.consumerId).toBe("b");
    expect(d.producerId).toBe("a");
    expect(d.direction).toBe(-1);
    expect(d.invoiced).toBe(6);
    expect(d.carriedInOriented).toBe(-3);
    expect(d.carriedOutCanonical).toBe(0);
  });

  it("stores a high → low carry with a negative canonical sign", () => {
    const d = decidePairBalance({ low: "a", high: "b", energy: -4, carriedIn: 0 }, 5, false);
    expect(d.consumerId).toBe("b");
    expect(d.carriedOutOriented).toBe(4);
    expect(d.carriedOutCanonical).toBe(-4);
  });

  it("forces the invoice on early and final runs", () => {
    const d = decidePairBalance({ low: "a", high: "b", energy: 0, carriedIn: 1.5 }, 5, true);
    expect(d.invoiced).toBe(1.5);
    expect(d.carriedOutOriented).toBe(0);
  });

  it("invoices at or above the threshold", () => {
    const d = decidePairBalance({ low: "a", high: "b", energy: 4, carriedIn: 1 }, 5, false);
    expect(d.invoiced).toBe(5);
    expect(d.carriedInOriented).toBe(1);
  });

  it("returns a zero balance without carrying", () => {
    const d = decidePairBalance({ low: "a", high: "b", energy: 2, carriedIn: -2 }, 5, false);
    expect(d.gross).toBe(0);
    expect(d.invoiced).toBe(0);
    expect(d.carriedOutOriented).toBe(0);
  });
});

describe("SettlementStore carry-forward (BR-05)", () => {
  it("keeps the sign relative to the argument order", () => {
    const store = new SettlementStore();
    store.setCarry("com", "b", "a", 3);
    expect(store.getCarry("b", "a")).toBe(3);
    expect(store.getCarry("a", "b")).toBe(-3);
    expect(store.listCarries("com")).toEqual([{ low: "a", high: "b", amount: -3 }]);
  });

  it("lists carries per community and drops settled pairs", () => {
    const store = new SettlementStore();
    store.setCarry("com-1", "a", "b", 2);
    store.setCarry("com-2", "c", "d", 1);
    expect(store.listCarries("com-1")).toEqual([{ low: "a", high: "b", amount: 2 }]);
    store.setCarry("com-1", "a", "b", 0);
    expect(store.listCarries("com-1")).toEqual([]);
    expect(store.getCarry("a", "b")).toBe(0);
    store.reset();
    expect(store.listCarries("com-2")).toEqual([]);
  });
});
