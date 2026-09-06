export function paymentSetupPageTitle(
  asProsumer: boolean,
  asProducer: boolean,
  setupIncomplete: boolean,
): string {
  if (asProsumer) {
    return setupIncomplete ? "Payouts and card" : "Payment account";
  }
  if (asProducer) {
    return setupIncomplete ? "Open Stripe Connect" : "Payout account";
  }
  return setupIncomplete ? "Add a payment method" : "Payment method";
}

export function paymentSetupPageDescription(
  asProsumer: boolean,
  asProducer: boolean,
  setupIncomplete: boolean,
): string {
  if (asProsumer) {
    return setupIncomplete
      ? "Complete Connect KYC, then save a card to pay when you buy."
      : "Connect receives sales; your card pays open invoices when you buy.";
  }
  if (asProducer) {
    return setupIncomplete
      ? "Producers receive payouts on their Connect account. Complete KYC once."
      : "Stripe Connect receives consumer payments for invoices in your name.";
  }
  return setupIncomplete
    ? "Save a card so open invoices can be paid in one click."
    : "Card used when you pay open invoices.";
}

export function paymentSetupStartLabel(
  asProsumer: boolean,
  asProducer: boolean,
): string {
  if (asProsumer) {
    return "Start payouts and card setup";
  }
  if (asProducer) {
    return "Continue to Stripe Connect";
  }
  return "Save card and finish";
}

export function paymentSetupIntroCopy(
  asProsumer: boolean,
  asProducer: boolean,
  setupIncomplete: boolean,
): string {
  if (asProsumer) {
    return setupIncomplete
      ? "Prosumers need Connect for sales and a card for purchases. Bank and card details go to Stripe only — this app never stores them."
      : "Connect receives sales; your card pays open invoices when you buy. Details stay with Stripe only.";
  }
  if (asProducer) {
    return setupIncomplete
      ? "Producers receive payouts on their Connect account. Complete KYC once. Bank details go to Stripe only — this app never stores them."
      : "Stripe Connect receives consumer payments for invoices in your name. Bank details go to Stripe only — this app never stores them.";
  }
  return setupIncomplete
    ? "Save a card so open invoices can be paid in one click. Card numbers go to Stripe only — this app never stores them."
    : "Card used when you pay open invoices. Card numbers go to Stripe only — this app never stores them.";
}

export function formatPaymentBrand(brand: string | undefined): string | null {
  if (!brand) {
    return null;
  }
  if (brand === "sepa_debit") {
    return "SEPA";
  }
  return brand.charAt(0).toUpperCase() + brand.slice(1);
}
