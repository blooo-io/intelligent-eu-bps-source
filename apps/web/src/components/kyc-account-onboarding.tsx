import { useEffect, useRef, useState } from "react";
import { Alert } from "antd";
import type { WebConfig } from "../api/config";
import {
  mountAccountOnboarding,
  type AccountOnboardingHandle,
  type LoadConnectFn,
} from "../api/stripe-connect-onboarding";

/**
 * INT-362 / INT-429 — Stripe Connect embedded Account onboarding for KYC
 * (REQ-051, TD-6). Every participant role uses this on the Identity wizard
 * step; managers use hosted Identity verification instead.
 */
export function KycAccountOnboarding({
  config,
  clientSecret,
  refreshClientSecret,
  onExit,
  loadConnect,
}: Readonly<{
  config: WebConfig;
  /** Account Session secret from the Start call, used for the first mount. */
  clientSecret: string;
  /** Mints a new Account Session when Connect.js asks again (expiry). */
  refreshClientSecret: () => Promise<string>;
  onExit: () => void;
  loadConnect?: LoadConnectFn;
}>) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Latest callbacks without remounting the Stripe iframe on every render.
  const exitRef = useRef(onExit);
  const refreshRef = useRef(refreshClientSecret);
  exitRef.current = onExit;
  refreshRef.current = refreshClientSecret;

  useEffect(() => {
    if (!mountRef.current || !config.stripePublishableKey) {
      setError("Stripe publishable key missing");
      return;
    }
    let handle: AccountOnboardingHandle | null = null;
    let firstSecret: string | null = clientSecret;
    try {
      handle = mountAccountOnboarding({
        publishableKey: config.stripePublishableKey,
        container: mountRef.current,
        fetchClientSecret: async () => {
          // Use the session from Start once, then mint fresh ones.
          if (firstSecret) {
            const secret = firstSecret;
            firstSecret = null;
            return secret;
          }
          return refreshRef.current();
        },
        onExit: () => exitRef.current(),
        loadConnectFn: loadConnect,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Stripe onboarding");
    }
    return () => {
      handle?.destroy();
    };
  }, [clientSecret, config.stripePublishableKey, loadConnect]);

  return (
    <div style={{ marginTop: 16 }}>
      {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 12 }} />}
      <div ref={mountRef} data-testid="stripe-account-onboarding" />
    </div>
  );
}

/** @deprecated Use KycAccountOnboarding — kept for transitional imports. */
export const ProducerAccountOnboarding = KycAccountOnboarding;
