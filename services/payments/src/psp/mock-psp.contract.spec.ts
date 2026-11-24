/**
 * Contract suite against MockPspAdapter (WS5 Task 5.3 / INT-424).
 */

import { describe, expect, it } from "vitest";
import { MockPspAdapter } from "./mock-psp.adapter.js";
import {
  INV1,
  P1,
  runPspContractSuite,
  type PspContractHarness,
} from "./testing/psp-contract.suite.js";

async function mockHarness(): Promise<PspContractHarness> {
  const adapter = new MockPspAdapter();
  return {
    adapter,
    completeKyc: (pspAccountRef) => adapter.completeKyc(pspAccountRef),
    fundBalance: (pspAccountRef, amount, currency) =>
      adapter.fundBalance(pspAccountRef, amount, currency),
    paymentMethod: (kind) => adapter.paymentMethod(kind),
    payoutSchedule: async (pspAccountRef) =>
      adapter.payoutSchedule(pspAccountRef) ?? "unknown",
    signedEvent: (e) => adapter.signEvent(e),
  };
}

runPspContractSuite("MockPspAdapter", async () => mockHarness());

describe("MockPspAdapter fee model", () => {
  it("UAT-057 mock fee model: card 1.5% + 0.25, SEPA 0.35 flat", async () => {
    const h = await mockHarness();
    const m = h.adapter;
    const { pspAccountRef } = await m.createConnectedAccount({
      participantId: P1,
      country: "FR",
    });
    await h.completeKyc(pspAccountRef);
    const { pspCustomerRef } = await m.ensureCustomer({
      participantId: P1,
      pspAccountRef,
    });

    const card100 = await m.createDirectCharge({
      invoiceId: INV1,
      amount: "100.00",
      currency: "EUR",
      pspAccountRef,
      pspCustomerRef,
      pspPaymentMethodRef: await h.paymentMethod("card_ok"),
      idempotencyKey: `pay:${INV1}:card-fee`,
    });
    expect(
      await m.getChargeSettlement({
        pspPaymentRef: card100.pspPaymentRef,
        pspAccountRef,
      }),
    ).toEqual({ method: "card", feeAmount: "1.75", feeCurrency: "EUR" });

    const sepa100 = await m.createDirectCharge({
      invoiceId: INV1,
      amount: "100.00",
      currency: "EUR",
      pspAccountRef,
      pspCustomerRef,
      pspPaymentMethodRef: await h.paymentMethod("sepa_ok"),
      idempotencyKey: `pay:${INV1}:sepa-fee`,
    });
    expect(sepa100.status).toBe("pending");
    expect(
      await m.getChargeSettlement({
        pspPaymentRef: sepa100.pspPaymentRef,
        pspAccountRef,
      }),
    ).toBeNull();
    const adapter = m as MockPspAdapter;
    adapter.settleSepa(sepa100.pspPaymentRef, "2026-11-27T10:00:00.000Z");
    expect(
      await m.getChargeSettlement({
        pspPaymentRef: sepa100.pspPaymentRef,
        pspAccountRef,
      }),
    ).toEqual({
      method: "sepa_debit",
      feeAmount: "0.35",
      feeCurrency: "EUR",
    });
  });
});
