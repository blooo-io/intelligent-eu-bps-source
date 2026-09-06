import {
  PaymentMethodReadyCard,
  PayoutAccountReadyCard,
} from "./payment-setup-ready-cards";
import type { MePaymentAccount } from "../api/payment";

export function PaymentSetupReadySection({
  readyConsumerCard,
  brandLabel,
  account,
  setupIncomplete,
  asProducer,
  asProsumer,
}: Readonly<{
  readyConsumerCard: boolean;
  brandLabel: string | null;
  account: MePaymentAccount | null;
  setupIncomplete: boolean;
  asProducer: boolean;
  asProsumer: boolean;
}>) {
  const showPayout =
    !setupIncomplete &&
    (asProducer || asProsumer) &&
    Boolean(account?.stripeAccountId);

  return (
    <>
      {readyConsumerCard && account?.last4 ? (
        <PaymentMethodReadyCard
          brandLabel={brandLabel}
          last4={account.last4}
        />
      ) : null}
      {showPayout && account ? <PayoutAccountReadyCard account={account} /> : null}
    </>
  );
}
