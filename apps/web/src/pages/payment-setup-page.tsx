import { useState } from "react";
import { Alert, Button, Card, Space, Typography } from "antd";
import { Link } from "react-router";
import type { WebConfig } from "../api/config";
import type { OidcFacade } from "../auth/oidc";
import { createPaymentOnboarding } from "../api/payment";

const { Title, Paragraph } = Typography;

/**
 * Payment setup via Stripe-hosted onboarding (INT-140 / REQ-051 / UAT-063).
 * The billing app never collects card or bank details — only a provider link (TD-6).
 */
export function PaymentSetupPage({
  config,
  oidc,
  /** Test seam — open the provider URL (defaults to location.assign). */
  openUrl = (url: string) => {
    window.location.assign(url);
  },
}: {
  config: WebConfig;
  oidc: OidcFacade;
  openUrl?: (url: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkUrl, setLinkUrl] = useState<string | null>(null);

  async function startOnboarding() {
    setLoading(true);
    setError(null);
    try {
      const token = await oidc.getAccessToken();
      if (!token) throw new Error("No access token");
      const link = await createPaymentOnboarding(config.apiBaseUrl, token);
      setLinkUrl(link.url);
      openUrl(link.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Onboarding failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 24,
        background: "linear-gradient(180deg, #f4faf7 0%, #ffffff 40%)",
      }}
    >
      <Space direction="vertical" size="large" style={{ width: "100%", maxWidth: 640 }}>
        <Space style={{ width: "100%", justifyContent: "space-between" }}>
          <Title level={2} style={{ margin: 0 }}>
            Payment setup
          </Title>
          <Link to="/">Back to home</Link>
        </Space>

        {error && <Alert type="error" message={error} showIcon />}

        <Card>
          <Paragraph>
            Producers complete Stripe Connect (identity and bank account). Consumers
            add a payment method. You are redirected to Stripe — this app never
            collects card or bank details (REQ-051, TD-6).
          </Paragraph>
          <Button type="primary" size="large" loading={loading} onClick={startOnboarding}>
            Continue to Stripe
          </Button>
          {linkUrl && (
            <Paragraph type="secondary" style={{ marginTop: 16 }}>
              Provider link issued. If you were not redirected,{" "}
              <a href={linkUrl} rel="noreferrer">
                open Stripe onboarding
              </a>
              .
            </Paragraph>
          )}
        </Card>
      </Space>
    </main>
  );
}
