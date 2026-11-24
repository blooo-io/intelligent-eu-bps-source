/**
 * Suggested corrective actions for failed payments (REQ-046 / KPI UE-3).
 * Keyed on PspFailureCategory values projected from AC-07.
 */

const ACTIONS = {
  card_declined:
    "Use another card or contact your bank, then pay again from the billing portal",
  insufficient_funds:
    "Top up the account or choose another payment method, then pay again",
  authentication_required:
    "Complete the bank authentication (3-D Secure) and pay again",
  mandate_invalid:
    "Authorise a new SEPA Direct Debit mandate or pay by card",
  bank_account_invalid:
    "Update the bank account in your payment-provider onboarding, then withdraw again",
  provider_error: "Temporary payment-provider error: try again later",
  other: "Contact your community manager",
} as const;

type PspFailureCategory = keyof typeof ACTIONS;

const GENERIC = ACTIONS.other;

export function suggestedCorrectiveAction(
  category: string | undefined,
): string {
  if (!category) return GENERIC;

  const key = category.toLowerCase();
  if (key in ACTIONS) {
    return ACTIONS[key as PspFailureCategory];
  }

  // Legacy keyword matching for non-canonical PSP codes.
  if (key.includes("insufficient")) {
    return ACTIONS.insufficient_funds;
  }
  if (key.includes("authentication") || key.includes("3ds")) {
    return ACTIONS.authentication_required;
  }
  if (key.includes("declin") || key.includes("card")) {
    return ACTIONS.card_declined;
  }

  return GENERIC;
}
