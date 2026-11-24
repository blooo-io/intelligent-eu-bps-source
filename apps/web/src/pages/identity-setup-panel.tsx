import { useState } from "react";
import { Alert, Button, Card, Typography } from "antd";
import type { WebConfig } from "../api/config";
import type { OnboardingSession } from "../api/payment";
import type { LoadConnectFn } from "../api/stripe-connect-onboarding";
import type { OidcFacade } from "../auth/oidc";
import { KycAccountOnboarding } from "../components/kyc-account-onboarding";
import {
  identitySetupIntroCopy,
  identitySetupStartLabel,
} from "./payment-setup-copy";
import {
  refreshOnboardingClientSecret,
  startPaymentOnboarding,
} from "./payment-setup-actions";

const { Paragraph } = Typography;

/**
 * Wizard Identity step (INT-429 / REQ-051) — Connect embedded KYC for every
 * participant role. Managers use ManagerVerificationPage instead.
 */
export function IdentitySetupPanel({
  config,
  oidc,
  onComplete,
  loadConnect,
}: Readonly<{
  config: WebConfig;
  oidc: OidcFacade;
  onComplete?: () => void;
  loadConnect?: LoadConnectFn;
}>) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<OnboardingSession | null>(null);

  async function start() {
    setLoading(true);
    setError(null);
    try {
      const result = await startPaymentOnboarding({
        config,
        oidc,
        openUrl: (url) => {
          window.location.assign(url);
        },
        onComplete,
      });
      setSession(result.session);
      if (
        result.session.mode !== "embedded" &&
        result.session.status !== "complete"
      ) {
        setError("Identity verification session unavailable");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  function refreshClientSecret() {
    return refreshOnboardingClientSecret({ config, oidc });
  }

  return (
    <Card>
      {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 12 }} />}
      <Paragraph>{identitySetupIntroCopy()}</Paragraph>
      {!session || session.status === "complete" ? (
        <Button type="primary" loading={loading} onClick={() => void start()}>
          {identitySetupStartLabel()}
        </Button>
      ) : null}
      {session?.status === "complete" ? (
        <Alert
          type="success"
          showIcon
          style={{ marginTop: 12 }}
          message="Identity verification complete"
        />
      ) : null}
      {session?.mode === "embedded" &&
      session.status !== "complete" &&
      session.clientSecret ? (
        <KycAccountOnboarding
          config={config}
          clientSecret={session.clientSecret}
          refreshClientSecret={refreshClientSecret}
          onExit={() => void start()}
          loadConnect={loadConnect}
        />
      ) : null}
    </Card>
  );
}
