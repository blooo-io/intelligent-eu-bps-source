import { Alert, Card, Typography } from "antd";
import type { FormInstance } from "antd";
import type { WebConfig } from "../api/config";
import type { MePaymentAccount, OnboardingSession } from "../api/payment";
import type { LoadStripeFn } from "../api/stripe-account-token";
import type { LoadStripeSetupFn } from "../api/stripe-setup-element";
import { PaymentSetupReadySection } from "./payment-setup-ready-section";
import {
  PaymentSetupCompleteAlert,
  PaymentSetupElementsPanel,
  PaymentSetupLinkPanel,
  PaymentSetupStartButton,
} from "./payment-setup-session-panels";
import {
  PaymentSetupKycForm,
  type PaymentKycFormValues,
} from "./payment-setup-kyc-form";

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
  showRequirements: boolean;
  form: FormInstance<PaymentKycFormValues>;
  onStart: () => void;
  onPaymentMethodAttached: (paymentMethodId: string) => Promise<void>;
  onSubmitRequirements: (values: PaymentKycFormValues) => void;
  loadStripeSetup?: LoadStripeSetupFn;
  loadStripe?: LoadStripeFn;
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
  showRequirements,
  form,
  onStart,
  onPaymentMethodAttached,
  onSubmitRequirements,
  loadStripeSetup,
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

        {showRequirements && (
          <PaymentSetupKycForm
            form={form}
            loading={loading}
            currentlyDue={session?.currentlyDue}
            onSubmit={onSubmitRequirements}
          />
        )}
      </Card>
    </>
  );
}
