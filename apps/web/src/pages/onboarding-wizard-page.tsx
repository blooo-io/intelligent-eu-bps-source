import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Steps, Typography } from "antd";
import { Link, useNavigate, useSearchParams } from "react-router";
import type { WebConfig } from "../api/config";
import { fetchMe, type Me, type ReadinessStatus } from "../api/me";
import type { OidcFacade } from "../auth/oidc";
import { PageFrame } from "../layout/page-frame";
import { readinessLabel } from "../layout/readiness-label";
import { isSellerRole } from "../layout/role-home";
import { PaymentSetupPage } from "./payment-setup-page";
import { ProfilePage } from "./profile-page";
import { TermsPage } from "./terms-page";
import { InvoicesPage } from "./invoices-page";

const { Paragraph } = Typography;

const STEP_KEYS = ["profile", "terms", "payment", "pay"] as const;
type StepKey = (typeof STEP_KEYS)[number];

function stepFromReadiness(status: ReadinessStatus): StepKey {
  switch (status) {
    case "Invited":
      return "profile";
    case "ProfileCompleted":
      return "terms";
    case "TermsAccepted":
      return "payment";
    case "Ready":
      return "pay";
    default:
      return "profile";
  }
}

function stepIndex(key: StepKey): number {
  return STEP_KEYS.indexOf(key);
}

/**
 * Member journey wizard (INT-193 / NFR-016 / UAT-067).
 * Steps: Profile → Terms → Payment setup (KYC/PM) → Pay invoice.
 * Step-count optimisation is deferred; completion without assistance is the bar.
 */
export function OnboardingWizardPage({
  config,
  oidc,
}: {
  config: WebConfig;
  oidc: OidcFacade;
}) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reloadMe = useCallback(async () => {
    const token = await oidc.getAccessToken();
    if (!token) throw new Error("No access token");
    return fetchMe(config.apiBaseUrl, token);
  }, [config.apiBaseUrl, oidc]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await reloadMe();
        if (!cancelled) setMe(result);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load profile");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadMe]);

  const suggested = me ? stepFromReadiness(me.readiness) : "profile";
  const paramStep = params.get("step") as StepKey | null;
  const current: StepKey =
    paramStep && STEP_KEYS.includes(paramStep) ? paramStep : suggested;

  const items = useMemo(
    () => [
      {
        title: "Profile",
        description: "Billing identity",
        status:
          me && stepIndex(stepFromReadiness(me.readiness)) > 0
            ? ("finish" as const)
            : current === "profile"
              ? ("process" as const)
              : ("wait" as const),
      },
      {
        title: "Terms",
        description: "Accept & self-billing",
        status:
          me && stepIndex(stepFromReadiness(me.readiness)) > 1
            ? ("finish" as const)
            : current === "terms"
              ? ("process" as const)
              : ("wait" as const),
      },
      {
        title: isSellerRole(me?.role) ? "Payouts" : "Pay",
        description: isSellerRole(me?.role) ? "Stripe Connect" : "Card",
        status:
          me && me.readiness === "Ready"
            ? ("finish" as const)
            : current === "payment"
              ? ("process" as const)
              : ("wait" as const),
      },
      {
        title: "Pay",
        description: "Invoice payment",
        status: current === "pay" ? ("process" as const) : ("wait" as const),
      },
    ],
    [current, me],
  );

  function go(step: StepKey) {
    setParams({ step });
  }

  async function afterGate() {
    try {
      const next = await reloadMe();
      setMe(next);
      go(stepFromReadiness(next.readiness));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh failed");
    }
  }

  return (
    <PageFrame
      title="Get ready"
      description="Finish these steps in order: profile, terms, payment setup, then pay your invoices."
      loading={loading}
    >
      {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}

      <Card style={{ marginBottom: 16 }} className="ge-onboarding-card">
        <Steps
          current={stepIndex(current)}
          items={items}
          onChange={(i) => go(STEP_KEYS[i]!)}
          className="ge-onboarding-steps"
          style={{ marginBottom: 12 }}
        />
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          {readinessLabel(me?.readiness)}
          {" · "}
          <Link to="/">Home</Link>
        </Paragraph>
      </Card>

      {current === "profile" && (
        <div>
          <ProfilePage config={config} oidc={oidc} embedded />
          <Button type="primary" style={{ marginTop: 16 }} onClick={() => void afterGate()}>
            Continue to terms
          </Button>
        </div>
      )}

      {current === "terms" && (
        <div>
          <TermsPage config={config} oidc={oidc} embedded />
          <Button type="primary" style={{ marginTop: 16 }} onClick={() => void afterGate()}>
            Continue to payment setup
          </Button>
        </div>
      )}

      {current === "payment" && (
        <PaymentSetupPage
          config={config}
          oidc={oidc}
          embedded
          onComplete={() => void afterGate()}
        />
      )}

      {current === "pay" && (
        <div>
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message="You are Ready — pay any open invoice below (test mode)."
          />
          <InvoicesPage config={config} oidc={oidc} embedded />
          <Button style={{ marginTop: 16 }} onClick={() => navigate("/")}>
            Finish
          </Button>
        </div>
      )}
    </PageFrame>
  );
}
