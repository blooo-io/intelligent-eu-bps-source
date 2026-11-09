import { describe, expect, it } from "vitest";
import { decidePairBalance } from "./carry.js";
import { type Dec, ZERO, dec, toFixed } from "./decimal.js";
import { SettlementStore } from "./store.js";

const money = (v: Dec) => toFixed(v, 2);
const decide = (energy: string, carriedIn: string, threshold: string, force = false) =>
  decidePairBalance({ low: "a", high: "b", energy: dec(energy), carriedIn: dec(carriedIn) }, dec(threshold), force);

describe("decidePairBalance (BR-04, BR-05, REQ-056)", () => {
  it("nets a reversed period against the carried balance instead of adding it", () => {
    // Period 1: low owed high 3.00 (carried). Period 2: high owes low 2.00.
    const d = decide("-2", "3", "5");
    expect(d.consumerId).toBe("a");
    expect(d.producerId).toBe("b");
    expect(money(d.gross)).toBe("1.00");
    expect(d.invoiced).toBe(ZERO);
    expect(money(d.carriedInOriented)).toBe("3.00");
    expect(money(d.carriedOutOriented)).toBe("1.00");
    expect(money(d.carriedOutCanonical)).toBe("1.00");
  });

  it("flips the invoice direction when the reversal exceeds the carried balance", () => {
    const d = decide("-9", "3", "5");
    expect(d.consumerId).toBe("b");
    expect(d.producerId).toBe("a");
    expect(d.direction).toBe(-1);
    expect(money(d.invoiced)).toBe("6.00");
    expect(money(d.carriedInOriented)).toBe("-3.00");
    expect(d.carriedOutCanonical).toBe(ZERO);
  });

  it("stores a high → low carry with a negative canonical sign", () => {
    const d = decide("-4", "0", "5");
    expect(d.consumerId).toBe("b");
    expect(money(d.carriedOutOriented)).toBe("4.00");
    expect(money(d.carriedOutCanonical)).toBe("-4.00");
  });

  it("forces the invoice on early and final runs", () => {
    const d = decide("0", "1.5", "5", true);
    expect(money(d.invoiced)).toBe("1.50");
    expect(d.carriedOutOriented).toBe(ZERO);
  });

  it("invoices at or above the threshold", () => {
    const d = decide("4", "1", "5");
    expect(money(d.invoiced)).toBe("5.00");
    expect(money(d.carriedInOriented)).toBe("1.00");
  });

  it("returns a zero balance without carrying", () => {
    const d = decide("2", "-2", "5");
    expect(d.gross).toBe(ZERO);
    expect(d.invoiced).toBe(ZERO);
    expect(d.carriedOutOriented).toBe(ZERO);
  });

  it("rounds the exact energy amount once, to the cent (BR-08)", () => {
    expect(money(decide("0.096", "0", "0").invoiced)).toBe("0.10");
    expect(money(decide("0.004999", "0", "0").invoiced)).toBe("0.00");
  });
});

describe("SettlementStore carry-forward (BR-05)", () => {
  it("keeps the sign relative to the argument order", () => {
    const store = new SettlementStore();
    store.setCarry("com", "b", "a", dec("3"));
    expect(money(store.getCarry("b", "a"))).toBe("3.00");
    expect(money(store.getCarry("a", "b"))).toBe("-3.00");
    expect(store.listCarries("com")).toEqual([{ low: "a", high: "b", amount: dec("-3") }]);
  });

  it("lists carries per community and drops settled pairs", () => {
    const store = new SettlementStore();
    store.setCarry("com-1", "a", "b", dec("2"));
    store.setCarry("com-2", "c", "d", dec("1"));
    expect(store.listCarries("com-1")).toEqual([{ low: "a", high: "b", amount: dec("2") }]);
    store.setCarry("com-1", "a", "b", ZERO);
    expect(store.listCarries("com-1")).toEqual([]);
    expect(store.getCarry("a", "b")).toBe(ZERO);
    store.reset();
    expect(store.listCarries("com-2")).toEqual([]);
  });
});
