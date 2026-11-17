import { useState } from "react";
import { Button, Card, Typography } from "antd";
import { Link, useNavigate } from "react-router";
import type { WebConfig } from "../api/config";
import type { Me } from "../api/me";
import type { OidcFacade } from "../auth/oidc";
import { ProfilePage } from "./profile-page";
import { TermsPage } from "./terms-page";
import { PaymentSetupPage } from "./payment-setup-page";

const { Paragraph } = Typography;

import type { WizardStepKey } from "./use-onboarding-wizard";

type StepKey = WizardStepKey;

type OnboardingWizardStepPanelProps = {
  current: StepKey;
  me: Me | null;
  config: WebConfig;
  oidc: OidcFacade;
  onAfterGate: () => void;
};

export function OnboardingWizardStepPanel({
  current,
  me,
  config,
  oidc,
  onAfterGate,
}: Readonly<OnboardingWizardStepPanelProps>) {
  const navigate = useNavigate();
  const [profileSaved, setProfileSaved] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const profileGate = profileSaved || (me !== null && me.readiness !== "Invited");
  const termsGate =
    termsAccepted || me?.readiness === "TermsAccepted" || me?.readiness === "Ready";

  if (me?.readiness === "Ready" && current === "payment") {
    return (
      <Card size="small">
        <Paragraph>You are ready. Money screens are unlocked.</Paragraph>
        <Button type="primary" onClick={() => navigate("/invoices")}>
          Go to invoices
        </Button>
      </Card>
    );
  }

  if (current === "profile" && me?.readiness !== "Ready") {
    return (
      <div>
        <ProfilePage
          config={config}
          oidc={oidc}
          embedded
          onSaved={() => setProfileSaved(true)}
        />
        <Button
          type="primary"
          style={{ marginTop: 16 }}
          disabled={!profileGate}
          onClick={onAfterGate}
        >
          Continue to terms
        </Button>
      </div>
    );
  }

  if (current === "terms" && me?.readiness !== "Ready") {
    return (
      <div>
        <TermsPage
          config={config}
          oidc={oidc}
          embedded
          onAccepted={() => setTermsAccepted(true)}
        />
        <Button
          type="primary"
          style={{ marginTop: 16 }}
          disabled={!termsGate}
          onClick={onAfterGate}
        >
          Continue to payment setup
        </Button>
      </div>
    );
  }

  if (current === "payment" && me?.readiness !== "Ready") {
    return (
      <PaymentSetupPage
        config={config}
        oidc={oidc}
        embedded
        onComplete={onAfterGate}
      />
    );
  }

  return (
    <Paragraph type="secondary">
      <Link to="/">Home</Link>
    </Paragraph>
  );
}
