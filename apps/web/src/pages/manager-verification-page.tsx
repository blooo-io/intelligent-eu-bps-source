import { useEffect, useState } from "react";
import { Alert, Spin } from "antd";
import { useNavigate } from "react-router";
import type { WebConfig } from "../api/config";
import { createIdentityVerification, fetchMyKyc } from "../api/kyc";
import type { OidcFacade } from "../auth/oidc";
import { PageFrame } from "../layout/page-frame";

/**
 * Manager KYC (INT-429 / REQ-051 / UAT-063) — hosted Stripe Identity only.
 * While GET /me/kyc reports kycVerified=false, this page starts a session and
 * redirects to the PSP URL. Connect onboarding is not used for managers.
 */
export function ManagerVerificationPage({
  config,
  oidc,
  assignLocation = (url: string) => {
    window.location.assign(url);
  },
}: Readonly<{
  config: WebConfig;
  oidc: OidcFacade;
  assignLocation?: (url: string) => void;
}>) {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await oidc.getAccessToken();
        if (!token) throw new Error("No access token");
        const kyc = await fetchMyKyc(config.apiBaseUrl, token);
        if (cancelled) return;
        if (kyc.kycVerified) {
          navigate("/", { replace: true });
          return;
        }
        const session = await createIdentityVerification(
          config.apiBaseUrl,
          token,
          { returnUrl: `${window.location.origin}/` },
        );
        if (cancelled) return;
        assignLocation(session.url);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Identity verification failed",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [assignLocation, config.apiBaseUrl, navigate, oidc]);

  return (
    <PageFrame
      title="Verify your identity"
      description="Community managers complete Stripe Identity verification once."
    >
      {error ? (
        <Alert type="error" message={error} showIcon />
      ) : (
        <Spin tip="Redirecting to identity verification…" />
      )}
    </PageFrame>
  );
}
