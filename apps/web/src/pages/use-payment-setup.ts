import { useState } from "react";
import type { WebConfig } from "../api/config";
import type { OidcFacade } from "../auth/oidc";
import type { OnboardingSession } from "../api/payment";
import { isSellerRole } from "../layout/role-home";
import {
  attachPaymentMethodOnboarding,
  refreshOnboardingClientSecret,
  startPaymentOnboarding,
} from "./payment-setup-actions";
import { usePaymentSetupMe } from "./use-payment-setup-me";

export function usePaymentSetup({
  config,
  oidc,
  openUrl,
  onComplete,
}: {
  config: WebConfig;
  oidc: OidcFacade;
  openUrl: (url: string) => void;
  onComplete?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<OnboardingSession | null>(null);
  const { marketRole, readiness, account, setAccount } = usePaymentSetupMe(
    config,
    oidc,
  );

  async function runAction<T>(action: () => Promise<T>): Promise<T | undefined> {
    setLoading(true);
    setError(null);
    try {
      return await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
      return undefined;
    } finally {
      setLoading(false);
    }
  }

  async function startOnboarding() {
    const result = await runAction(() =>
      startPaymentOnboarding({ config, oidc, openUrl, onComplete }),
    );
    if (!result) return;
    setSession(result.session);
    if (result.account) setAccount(result.account);
  }

  async function onPaymentMethodAttached(paymentMethodId: string) {
    const next = await runAction(() =>
      attachPaymentMethodOnboarding({
        config,
        oidc,
        paymentMethodId,
        onComplete,
      }),
    );
    if (next) setSession(next);
  }

  /** INT-362 — Connect.js asks for a new Account Session when one expires. */
  function refreshClientSecret() {
    return refreshOnboardingClientSecret({ config, oidc });
  }

  const asProsumer = marketRole === "prosumer";
  const asProducer =
    (isSellerRole(marketRole) && !asProsumer) ||
    (session?.mode === "embedded" && !asProsumer);
  const setupIncomplete = readiness !== "Ready";

  return {
    loading,
    error,
    session,
    account,
    asProsumer,
    asProducer,
    setupIncomplete,
    startOnboarding,
    onPaymentMethodAttached,
    refreshClientSecret,
  };
}
