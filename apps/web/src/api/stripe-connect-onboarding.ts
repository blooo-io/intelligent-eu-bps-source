/**
 * INT-362 — mount the Stripe Connect embedded Account onboarding component
 * (REQ-051). Stripe collects KYC, bank details and the terms of service; the
 * portal never sees them. `@stripe/connect-js` is MIT; the pure entry does not
 * load Connect.js until mount.
 */

import { loadConnectAndInitialize } from "@stripe/connect-js/pure";

export type LoadConnectFn = typeof loadConnectAndInitialize;

export type AccountOnboardingHandle = {
  destroy: () => void;
};

/**
 * Mount account-onboarding into `container`.
 * `fetchClientSecret` is called by Connect.js at start and again whenever the
 * Account Session expires, so it must mint a fresh session each time.
 */
export function mountAccountOnboarding(input: {
  publishableKey: string;
  fetchClientSecret: () => Promise<string>;
  container: HTMLElement;
  onExit: () => void;
  loadConnectFn?: LoadConnectFn;
}): AccountOnboardingHandle {
  // BR-12 — V1 runs on Stripe test mode only.
  if (!input.publishableKey.startsWith("pk_test_")) {
    throw new Error("Only Stripe test publishable keys are allowed (BR-12)");
  }
  const load = input.loadConnectFn ?? loadConnectAndInitialize;
  const instance = load({
    publishableKey: input.publishableKey,
    fetchClientSecret: input.fetchClientSecret,
  });
  const element = instance.create("account-onboarding");
  // Fired when the producer finishes or leaves the flow; the caller re-reads status.
  element.setOnExit(input.onExit);
  input.container.appendChild(element);
  return {
    destroy: () => {
      element.remove();
    },
  };
}
