/**
 * Shared PSP adapter contract suite (WS5 Task 5.2 / INT-424).
 * Both MockPspAdapter and StripePspAdapter must pass these cases.
 *
 * Covers: REQ-014, REQ-015, REQ-016, REQ-046, REQ-051, UAT-014, UAT-015, UAT-016, UAT-057, NFR-015.
 */

import { describe, expect, it } from "vitest";
import type { CollectPort } from "../collect.port.js";
import type { KycOnboardingPort } from "../kyc-onboarding.port.js";
import type { PayoutPort } from "../payout.port.js";
import type { PspEventsPort } from "../psp-events.port.js";
import type { PspEvent } from "../psp.types.js";

/** Stable fixtures for contract cases. */
export const P1 = "11111111-1111-4111-8111-111111111111";
export const INV1 = "22222222-2222-4222-8222-222222222222";
export const INV2 = "33333333-3333-4333-8333-333333333333";
export const RET = "https://app.test/return";
export const REF = "https://app.test/refresh";

export type PspAdapter = KycOnboardingPort &
  CollectPort &
  PayoutPort &
  PspEventsPort;

export type PspContractHarness = {
  adapter: PspAdapter;
  completeKyc(pspAccountRef: string): Promise<void>;
  fundBalance(
    pspAccountRef: string,
    amount: string,
    currency: string,
  ): Promise<void>;
  paymentMethod(kind: "card_ok" | "card_decline" | "sepa_ok"): Promise<string>;
  payoutSchedule(pspAccountRef: string): Promise<string>;
  signedEvent(
    e: Omit<PspEvent, "eventId" | "occurredAt"> & { occurredAt?: string },
  ): { rawBody: string; signature: string };
};

async function readyAccount(
  h: PspContractHarness,
): Promise<{ a: PspAdapter; pspAccountRef: string }> {
  const a = h.adapter;
  const { pspAccountRef } = await a.createConnectedAccount({
    participantId: P1,
    country: "FR",
  });
  return { a, pspAccountRef };
}

async function readyCollect(h: PspContractHarness): Promise<{
  a: PspAdapter;
  pspAccountRef: string;
  pspCustomerRef: string;
}> {
  const { a, pspAccountRef } = await readyAccount(h);
  await h.completeKyc(pspAccountRef);
  const { pspCustomerRef } = await a.ensureCustomer({
    participantId: P1,
    pspAccountRef,
  });
  return { a, pspAccountRef, pspCustomerRef };
}

export function runPspContractSuite(
  label: string,
  makeHarness: () => Promise<PspContractHarness>,
): void {
  describe(`PSP contract: ${label}`, () => {
    describe("KYC", () => {
      it("REQ-051 new connected account needs KYC", async () => {
        const h = await makeHarness();
        const a = h.adapter;
        const { pspAccountRef } = await a.createConnectedAccount({
          participantId: P1,
          country: "FR",
        });
        expect(pspAccountRef).toMatch(/\S+/);
        expect(await a.getAccountStatus(pspAccountRef)).toMatchObject({
          status: "requirements_due",
          payoutsEnabled: false,
        });
      });

      it("REQ-051 hosted onboarding returns a PSP URL that expires", async () => {
        const h = await makeHarness();
        const { a, pspAccountRef } = await readyAccount(h);
        const s = await a.createOnboardingSession({
          pspAccountRef,
          mode: "hosted",
          returnUrl: RET,
          refreshUrl: REF,
        });
        expect(s.onboardingUrl).toMatch(/^https:\/\//);
        expect(Date.parse(s.expiresAt)).toBeGreaterThan(Date.now());
      });

      it("REQ-051 completed KYC enables charges and payouts", async () => {
        const h = await makeHarness();
        const { a, pspAccountRef } = await readyAccount(h);
        await h.completeKyc(pspAccountRef);
        expect(await a.getAccountStatus(pspAccountRef)).toMatchObject({
          status: "complete",
          chargesEnabled: true,
          payoutsEnabled: true,
        });
      });
    });

    describe("Collect", () => {
      it("UAT-014 REQ-014 direct card charge succeeds and is idempotent", async () => {
        const h = await makeHarness();
        const { a, pspAccountRef, pspCustomerRef } = await readyCollect(h);
        const input = {
          invoiceId: INV1,
          amount: "100.00",
          currency: "EUR",
          pspAccountRef,
          pspCustomerRef,
          pspPaymentMethodRef: await h.paymentMethod("card_ok"),
          idempotencyKey: `pay:${INV1}`,
        };
        const r1 = await a.createDirectCharge(input);
        const r2 = await a.createDirectCharge(input);
        expect(r1).toMatchObject({ status: "succeeded", method: "card" });
        expect(r2.pspPaymentRef).toBe(r1.pspPaymentRef);
      });

      it("UAT-016 REQ-016 declined card maps to card_declined", async () => {
        const h = await makeHarness();
        const { a, pspAccountRef, pspCustomerRef } = await readyCollect(h);
        expect(
          await a.createDirectCharge({
            invoiceId: INV1,
            amount: "100.00",
            currency: "EUR",
            pspAccountRef,
            pspCustomerRef,
            pspPaymentMethodRef: await h.paymentMethod("card_decline"),
            idempotencyKey: "k2",
          }),
        ).toMatchObject({ status: "failed", failureCategory: "card_declined" });
      });

      it("UAT-057 REQ-046 settlement exposes the PSP fee", async () => {
        const h = await makeHarness();
        const { a, pspAccountRef, pspCustomerRef } = await readyCollect(h);
        const r1 = await a.createDirectCharge({
          invoiceId: INV1,
          amount: "100.00",
          currency: "EUR",
          pspAccountRef,
          pspCustomerRef,
          pspPaymentMethodRef: await h.paymentMethod("card_ok"),
          idempotencyKey: `pay:${INV1}:settle`,
        });
        const s = await a.getChargeSettlement({
          pspPaymentRef: r1.pspPaymentRef,
          pspAccountRef,
        });
        expect(s).toMatchObject({ method: "card", feeCurrency: "EUR" });
        expect(s!.feeAmount).toMatch(/^\d+\.\d{2}$/);
      });

      it("REQ-014 hosted checkout offers card and SEPA on the producer account", async () => {
        const h = await makeHarness();
        const { a, pspAccountRef, pspCustomerRef } = await readyCollect(h);
        const c = await a.createCheckoutSession({
          invoiceId: INV2,
          amount: "42.50",
          currency: "EUR",
          pspAccountRef,
          pspCustomerRef,
          methods: ["card", "sepa_debit"],
          saveForFutureUse: true,
          successUrl: RET,
          cancelUrl: REF,
          idempotencyKey: `co:${INV2}`,
        });
        expect(c.checkoutUrl).toMatch(/^https:\/\//);
        expect(c.pspCheckoutRef).toMatch(/\S+/);
      });
    });

    describe("Payout+Events", () => {
      it("A2 / REQ-015 a new connected account starts on a manual payout schedule", async () => {
        const h = await makeHarness();
        const { pspAccountRef } = await readyAccount(h);
        expect(await h.payoutSchedule(pspAccountRef)).toBe("manual");
      });

      it("UAT-015 REQ-015 manual schedule then idempotent payout", async () => {
        const h = await makeHarness();
        const { a, pspAccountRef } = await readyAccount(h);
        await h.completeKyc(pspAccountRef);
        await a.setManualSchedule(pspAccountRef);
        await h.fundBalance(pspAccountRef, "80.00", "EUR");
        expect(await a.getAvailableBalance(pspAccountRef, "EUR")).toEqual({
          amount: "80.00",
          currency: "EUR",
        });
        const p1 = await a.createPayout(
          pspAccountRef,
          "80.00",
          "EUR",
          "po:P1:2026-11",
        );
        const p2 = await a.createPayout(
          pspAccountRef,
          "80.00",
          "EUR",
          "po:P1:2026-11",
        );
        expect(p2.pspPayoutRef).toBe(p1.pspPayoutRef);
        expect(["pending", "in_transit"]).toContain(p1.status);
      });

      it("REQ-015 payout above the available balance is refused", async () => {
        const h = await makeHarness();
        const { a, pspAccountRef } = await readyAccount(h);
        await h.completeKyc(pspAccountRef);
        await a.setManualSchedule(pspAccountRef);
        await expect(
          a.createPayout(pspAccountRef, "999.00", "EUR", "po:big"),
        ).rejects.toMatchObject({ code: "insufficient_balance" });
      });

      it("NFR-015 unsigned event rejected; signed events normalised", async () => {
        const h = await makeHarness();
        const { a, pspAccountRef } = await readyAccount(h);
        expect(a.verifyEvent("{}", "bad")).toEqual({ ok: false });
        const ok = h.signedEvent({
          kind: "payment.succeeded",
          pspAccountRef,
          pspPaymentRef: "ref1",
          occurredAt: "2026-11-24T10:00:03.000Z",
        });
        expect(a.verifyEvent(ok.rawBody, ok.signature)).toMatchObject({
          ok: true,
          event: {
            kind: "payment.succeeded",
            pspPaymentRef: "ref1",
            occurredAt: "2026-11-24T10:00:03.000Z",
          },
        });
        const pf = h.signedEvent({
          kind: "payout.failed",
          pspAccountRef,
          pspPayoutRef: "po1",
          failureCategory: "bank_account_invalid",
        });
        expect(a.verifyEvent(pf.rawBody, pf.signature)).toMatchObject({
          ok: true,
          event: {
            kind: "payout.failed",
            failureCategory: "bank_account_invalid",
          },
        });
      });
    });
  });
}
