import { Alert, Button, Typography } from "antd";
import { Link } from "react-router";
import type { WebConfig } from "../api/config";
import type { OnboardingSession } from "../api/payment";
import type { LoadStripeSetupFn } from "../api/stripe-setup-element";
import { ConsumerPaymentElement } from "../components/consumer-payment-element";

const { Paragraph } = Typography;

export function PaymentSetupLinkPanel({
  url,
}: Readonly<{ url: string }>) {
  return (
    <Paragraph type="secondary" style={{ marginTop: 16 }}>
      Provider link issued. If you were not redirected,{" "}
      <a href={url} rel="noreferrer">
        open Stripe payment-method setup
      </a>
      {"."}
    </Paragraph>
  );
}

export function PaymentSetupElementsPanel({
  config,
  session,
  onAttached,
  loadStripeSetup,
}: Readonly<{
  config: WebConfig;
  session: OnboardingSession;
  onAttached: (paymentMethodId: string) => Promise<void>;
  loadStripeSetup?: LoadStripeSetupFn;
}>) {
  if (!session.clientSecret) return null;
  return (
    <div style={{ marginTop: 16 }}>
      <Paragraph type="secondary">
        Enter a test card (for example 4242 4242 4242 4242) to save a payment
        method.
      </Paragraph>
      <ConsumerPaymentElement
        config={config}
        clientSecret={session.clientSecret}
        onAttached={onAttached}
        loadStripe={loadStripeSetup}
      />
    </div>
  );
}

export function PaymentSetupCompleteAlert({
  session,
  setupIncomplete = false,
  loading = false,
  onRetry,
}: Readonly<{
  session: OnboardingSession;
  setupIncomplete?: boolean;
  loading?: boolean;
  onRetry?: () => void;
}>) {
  return (
    <>
      <Alert
        type="success"
        showIcon
        message="Payment account ready"
        description={
          session.pspAccountRef
            ? `Connect account ${session.pspAccountRef} is complete.`
            : "Onboarding complete."
        }
      />
      {setupIncomplete ? (
        <div style={{ marginTop: 16 }}>
          <Button type="primary" loading={loading} onClick={onRetry}>
            Retry readiness
          </Button>
          <Link to="/" style={{ marginLeft: 12 }}>
            Home
          </Link>
        </div>
      ) : null}
    </>
  );
}

export function PaymentSetupStartButton({
  startLabel,
  loading,
  onStart,
}: Readonly<{
  startLabel: string;
  loading: boolean;
  onStart: () => void;
}>) {
  return (
    <Button type="primary" size="large" loading={loading} onClick={onStart}>
      {startLabel}
    </Button>
  );
}
