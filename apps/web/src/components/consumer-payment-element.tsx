import { useEffect, useRef, useState } from "react";
import { Alert, Button } from "antd";
import type { WebConfig } from "../api/config";
import {
  mountSetupPaymentElement,
  type LoadStripeSetupFn,
  type SetupElementHandle,
} from "../api/stripe-setup-element";

/**
 * INT-193 — consumer Payment Element for SetupIntent (REQ-040).
 * Card numbers go to Stripe only; never logged (TD-6, BR-12).
 */
export function ConsumerPaymentElement({
  config,
  clientSecret,
  onAttached,
  loadStripe,
}: Readonly<{
  config: WebConfig;
  clientSecret: string;
  onAttached: (paymentMethodId: string) => Promise<void>;
  loadStripe?: LoadStripeSetupFn;
}>) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<SetupElementHandle | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!mountRef.current || !config.stripePublishableKey) {
        setError("Stripe publishable key missing");
        return;
      }
      try {
        const handle = await mountSetupPaymentElement({
          publishableKey: config.stripePublishableKey,
          clientSecret,
          container: mountRef.current,
          loadStripeFn: loadStripe,
        });
        if (cancelled) {
          handle.destroy();
          return;
        }
        handleRef.current = handle;
        setReady(true);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load card form");
        }
      }
    })();
    return () => {
      cancelled = true;
      handleRef.current?.destroy();
      handleRef.current = null;
    };
  }, [clientSecret, config.stripePublishableKey, loadStripe]);

  async function onSubmit() {
    if (!handleRef.current) return;
    setBusy(true);
    setError(null);
    try {
      const { paymentMethodId } = await handleRef.current.confirm();
      await onAttached(paymentMethodId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save payment method");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 12 }} />}
      <div ref={mountRef} data-testid="stripe-payment-element" />
      <Button
        type="primary"
        style={{ marginTop: 16 }}
        loading={busy}
        disabled={!ready}
        onClick={onSubmit}
      >
        Save payment method
      </Button>
    </div>
  );
}
