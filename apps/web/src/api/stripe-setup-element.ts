/**
 * INT-193 — mount Stripe Payment Element for SetupIntent (consumer PM).
 * Uses Stripe.js only (no @stripe/react-stripe-js) — MIT, BR-12 pk_test.
 */

import { loadStripe, type Stripe, type StripeElements } from "@stripe/stripe-js";

/** Full Stripe.js loader (Payment Element / SetupIntent). Distinct from Account Token seam. */
export type LoadStripeSetupFn = typeof loadStripe;

export type SetupElementHandle = {
  confirm: () => Promise<{ paymentMethodId: string }>;
  destroy: () => void;
};

function paymentMethodIdFromSetupIntent(
  paymentMethod: string | { id: string } | null | undefined,
): string | undefined {
  if (typeof paymentMethod === "string") {
    return paymentMethod;
  }
  if (paymentMethod && typeof paymentMethod === "object") {
    return paymentMethod.id;
  }
  return undefined;
}

/**
 * Mount a Payment Element bound to a SetupIntent client secret.
 * Caller must keep the container mounted until destroy().
 */
export async function mountSetupPaymentElement(input: {
  publishableKey: string;
  clientSecret: string;
  container: HTMLElement;
  loadStripeFn?: LoadStripeSetupFn;
}): Promise<SetupElementHandle> {
  if (!input.publishableKey.startsWith("pk_test_")) {
    throw new Error("Only Stripe test publishable keys are allowed (BR-12)");
  }
  const loader = input.loadStripeFn ?? loadStripe;
  const stripe = await loader(input.publishableKey);
  if (!stripe) {
    throw new Error("Stripe.js failed to load");
  }
  const elements: StripeElements = stripe.elements({
    clientSecret: input.clientSecret,
  });
  // INT-276 / REQ-014 — Payment Element offers card and SEPA when SetupIntent allows.
  const paymentElement = elements.create("payment", {
    paymentMethodOrder: ["card", "sepa_debit"],
  });
  paymentElement.mount(input.container);

  return {
    async confirm() {
      const { error, setupIntent } = await stripe.confirmSetup({
        elements,
        redirect: "if_required",
        confirmParams: {
          return_url: `${window.location.origin}/onboarding?step=payment`,
        },
      });
      if (error) {
        throw new Error(error.message ?? "Payment method setup failed");
      }
      const paymentMethodId = paymentMethodIdFromSetupIntent(
        setupIntent?.payment_method,
      );
      if (!paymentMethodId) {
        throw new Error("SetupIntent succeeded without payment_method");
      }
      return { paymentMethodId };
    },
    destroy() {
      paymentElement.unmount();
    },
  };
}

/** Test seam — confirm without DOM (unit tests). */
export async function confirmSetupWithStripe(
  stripe: Pick<Stripe, "confirmSetup">,
  elements: StripeElements,
): Promise<string> {
  const { error, setupIntent } = await stripe.confirmSetup({
    elements,
    redirect: "if_required",
  });
  if (error) throw new Error(error.message ?? "confirmSetup failed");
  const pm = setupIntent?.payment_method;
  if (typeof pm === "string") return pm;
  if (pm && typeof pm === "object" && "id" in pm) return pm.id;
  throw new Error("missing payment_method");
}
