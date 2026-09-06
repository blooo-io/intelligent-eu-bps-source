import { Form } from "antd";
import type { WebConfig } from "../api/config";
import type { OidcFacade } from "../auth/oidc";
import type { LoadStripeFn } from "../api/stripe-account-token";
import type { LoadStripeSetupFn } from "../api/stripe-setup-element";
import { PageFrame } from "../layout/page-frame";
import { PaymentSetupBody } from "./payment-setup-body";
import {
  formatPaymentBrand,
  paymentSetupIntroCopy,
  paymentSetupPageDescription,
  paymentSetupPageTitle,
  paymentSetupStartLabel,
} from "./payment-setup-copy";
import type { PaymentKycFormValues } from "./payment-setup-kyc-form";
import { usePaymentSetup } from "./use-payment-setup";

/**
 * Payment setup (INT-140 / INT-190 / INT-191 / INT-193 / INT-252 / REQ-051 / UAT-051).
 */
export function PaymentSetupPage({
  config,
  oidc,
  openUrl = (url: string) => {
    window.location.assign(url);
  },
  loadStripe,
  loadStripeSetup,
  onComplete,
  embedded = false,
}: Readonly<{
  config: WebConfig;
  oidc: OidcFacade;
  openUrl?: (url: string) => void;
  loadStripe?: LoadStripeFn;
  loadStripeSetup?: LoadStripeSetupFn;
  onComplete?: () => void;
  embedded?: boolean;
}>) {
  const [form] = Form.useForm<PaymentKycFormValues>();
  const setup = usePaymentSetup({
    config,
    oidc,
    openUrl,
    loadStripe,
    onComplete,
  });

  const pageTitle = paymentSetupPageTitle(
    setup.asProsumer,
    setup.asProducer,
    setup.setupIncomplete,
  );
  const pageDescription = paymentSetupPageDescription(
    setup.asProsumer,
    setup.asProducer,
    setup.setupIncomplete,
  );
  const startLabel = paymentSetupStartLabel(setup.asProsumer, setup.asProducer);
  const brandLabel = formatPaymentBrand(setup.account?.brand);
  const readyConsumerCard =
    Boolean(setup.account?.last4) &&
    (!setup.setupIncomplete || setup.session?.status === "complete") &&
    (setup.asProsumer ||
      (!setup.asProducer && setup.account?.status === "complete"));

  const body = (
    <PaymentSetupBody
      config={config}
      error={setup.error}
      introCopy={paymentSetupIntroCopy(
        setup.asProsumer,
        setup.asProducer,
        setup.setupIncomplete,
      )}
      asProsumer={setup.asProsumer}
      asProducer={setup.asProducer}
      setupIncomplete={setup.setupIncomplete}
      startLabel={startLabel}
      loading={setup.loading}
      session={setup.session}
      account={setup.account}
      brandLabel={brandLabel}
      readyConsumerCard={readyConsumerCard}
      showRequirements={setup.showRequirements}
      form={form}
      onStart={() => void setup.startOnboarding()}
      onPaymentMethodAttached={(id) => setup.onPaymentMethodAttached(id)}
      onSubmitRequirements={(values) => void setup.submitRequirements(values)}
      loadStripeSetup={loadStripeSetup}
      loadStripe={loadStripe}
    />
  );

  if (embedded) {
    return body;
  }
  return (
    <PageFrame title={pageTitle} description={pageDescription}>
      {body}
    </PageFrame>
  );
}
