import { Button, Typography } from "antd";
import type { MePaymentAccount } from "../api/payment";

const { Paragraph, Text } = Typography;

export function PaymentMethodReadyCard({
  brandLabel,
  last4,
}: Readonly<{ brandLabel: string | null; last4: string }>) {
  return (
    <div data-testid="payment-method-ready" style={{ marginBottom: 16 }}>
      <Paragraph style={{ marginBottom: 4 }}>
        <Text strong>
          {brandLabel ?? "Card"} ···· {last4}
        </Text>
      </Paragraph>
      <Paragraph type="secondary" style={{ marginBottom: 0 }}>
        Default for invoice pay
      </Paragraph>
    </div>
  );
}

export function PayoutAccountReadyCard({
  account,
}: Readonly<{ account: MePaymentAccount }>) {
  return (
    <div data-testid="payout-account-ready" style={{ marginBottom: 16 }}>
      <Paragraph type="secondary" style={{ marginBottom: 12 }}>
        Connect account <Text code>{account.stripeAccountId}</Text>
      </Paragraph>
      {account.dashboardUrl ? (
        <Button
          type="primary"
          href={account.dashboardUrl}
          target="_blank"
          rel="noreferrer"
        >
          Open Stripe dashboard
        </Button>
      ) : null}
    </div>
  );
}
