import { Alert, Card, Typography } from "antd";
import type { WebConfig } from "../api/config";
import type { MePaymentAccount, OnboardingSession } from "../api/payment";
import type { LoadConnectFn } from "../api/stripe-connect-onboarding";
import type { LoadStripeSetupFn } from "../api/stripe-setup-element";
import { PaymentSetupReadySection } from "./payment-setup-ready-section";
import {
  PaymentSetupCompleteAlert,
  PaymentSetupElementsPanel,
  PaymentSetupLinkPanel,
  PaymentSetupStartButton,
} from "./payment-setup-session-panels";
import { ProducerAccountOnboarding } from "../components/producer-account-onboarding";

const { Paragraph } = Typography;

export type PaymentSetupBodyProps = {
  config: WebConfig;
  error: string | null;
  introCopy: string;
  asProsumer: boolean;
  asProducer: boolean;
  setupIncomplete: boolean;
  startLabel: string;
  loading: boolean;
  session: OnboardingSession | null;
  account: MePaymentAccount | null;
  brandLabel: string | null;
  readyConsumerCard: boolean;
  onStart: () => void;
  onPaymentMethodAttached: (paymentMethodId: string) => Promise<void>;
  refreshClientSecret: () => Promise<string>;
  loadStripeSetup?: LoadStripeSetupFn;
  loadConnect?: LoadConnectFn;
};

export function PaymentSetupBody({
  config,
  error,
  introCopy,
  asProsumer,
  asProducer,
  setupIncomplete,
  startLabel,
  loading,
  session,
  account,
  brandLabel,
  readyConsumerCard,
  onStart,
  onPaymentMethodAttached,
  refreshClientSecret,
  loadStripeSetup,
  loadConnect,
}: Readonly<PaymentSetupBodyProps>) {
  return (
    <>
      {error && <Alert type="error" message={error} showIcon />}

      <Card>
        <Paragraph>{introCopy}</Paragraph>

        <PaymentSetupReadySection
          readyConsumerCard={readyConsumerCard}
          brandLabel={brandLabel}
          account={account}
          setupIncomplete={setupIncomplete}
          asProducer={asProducer}
          asProsumer={asProsumer}
        />

        {!session && setupIncomplete ? (
          <PaymentSetupStartButton
            startLabel={startLabel}
            loading={loading}
            onStart={onStart}
          />
        ) : null}

        {session?.mode === "link" && session.url ? (
          <PaymentSetupLinkPanel url={session.url} />
        ) : null}

        {session?.mode === "elements" && session.status !== "complete" ? (
          <PaymentSetupElementsPanel
            config={config}
            session={session}
            onAttached={onPaymentMethodAttached}
            loadStripeSetup={loadStripeSetup}
          />
        ) : null}

        {session?.status === "complete" ? (
          <PaymentSetupCompleteAlert session={session} />
        ) : null}

        {session?.mode === "embedded" &&
        session.status !== "complete" &&
        session.clientSecret ? (
          // INT-362 — on exit, Start again re-reads the status from Stripe.
          <ProducerAccountOnboarding
            config={config}
            clientSecret={session.clientSecret}
            refreshClientSecret={refreshClientSecret}
            onExit={onStart}
            loadConnect={loadConnect}
          />
        ) : null}
      </Card>
    </>
  );
}
