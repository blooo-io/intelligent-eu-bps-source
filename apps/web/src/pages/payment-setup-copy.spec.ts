import { describe, expect, it } from "vitest";
import {
  formatPaymentBrand,
  paymentSetupIntroCopy,
  paymentSetupPageDescription,
  paymentSetupPageTitle,
  paymentSetupStartLabel,
} from "./payment-setup-copy";

describe("payment-setup-copy (INT-254)", () => {
  it("labels setup vs ready titles per persona", () => {
    expect(paymentSetupPageTitle(false, false, true)).toMatch(/add a payment method/i);
    expect(paymentSetupPageTitle(false, false, false)).toMatch(/^payment method$/i);
    expect(paymentSetupPageTitle(false, true, true)).toMatch(/open stripe connect/i);
    expect(paymentSetupPageTitle(false, true, false)).toMatch(/payout account/i);
    expect(paymentSetupPageTitle(true, false, true)).toMatch(/payouts and card/i);
    expect(paymentSetupPageTitle(true, false, false)).toMatch(/payment account/i);
  });

  it("describes setup vs ready flows per persona", () => {
    expect(paymentSetupPageDescription(false, false, true)).toMatch(/save a card/i);
    expect(paymentSetupPageDescription(false, false, false)).toMatch(/open invoices/i);
    expect(paymentSetupPageDescription(false, true, true)).toMatch(/complete kyc/i);
    expect(paymentSetupPageDescription(false, true, false)).toMatch(/connect receives/i);
    expect(paymentSetupPageDescription(true, false, true)).toMatch(/complete connect kyc/i);
    expect(paymentSetupPageDescription(true, false, false)).toMatch(/connect receives sales/i);
  });

  it("maps start CTA labels", () => {
    expect(paymentSetupStartLabel(false, false)).toMatch(/save card/i);
    expect(paymentSetupStartLabel(false, true)).toMatch(/continue to stripe connect/i);
    expect(paymentSetupStartLabel(true, false)).toMatch(/start payouts/i);
  });

  it("formats intro copy and payment brands", () => {
    expect(paymentSetupIntroCopy(false, false, true)).toMatch(/stripe only/i);
    expect(paymentSetupIntroCopy(false, true, false)).toMatch(/bank details go to stripe/i);
    expect(paymentSetupIntroCopy(true, false, true)).toMatch(/prosumers need connect/i);
    expect(formatPaymentBrand(undefined)).toBeNull();
    expect(formatPaymentBrand("sepa_debit")).toBe("SEPA");
    expect(formatPaymentBrand("visa")).toBe("Visa");
  });
});