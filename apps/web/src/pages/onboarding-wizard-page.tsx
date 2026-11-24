import { useMemo } from "react";
import { Alert, Card, Steps, Typography } from "antd";
import { Link } from "react-router";
import type { WebConfig } from "../api/config";
import type { OidcFacade } from "../auth/oidc";
import { PageFrame } from "../layout/page-frame";
import { readinessLabel } from "../layout/readiness-label";
import { wizardStepItems } from "./onboarding-wizard-step-model";
import { OnboardingWizardStepPanel } from "./onboarding-wizard-steps";
import { stepIndex, useOnboardingWizard } from "./use-onboarding-wizard";

const { Paragraph } = Typography;

/**
 * Member journey wizard (INT-193 / INT-255 / INT-429 / NFR-016 / UAT-067).
 * Volt MockSetup: Get ready — step N of 3|4; hide sider via AppShell (INT-254).
 */
export function OnboardingWizardPage({
  config,
  oidc,
}: Readonly<{
  config: WebConfig;
  oidc: OidcFacade;
}>) {
  const { me, error, loading, current, stepNumber, totalSteps, afterGate } =
    useOnboardingWizard(config, oidc);

  const items = useMemo(() => wizardStepItems(me, current), [current, me]);

  return (
    <PageFrame
      title={`Get ready — step ${stepNumber} of ${totalSteps}`}
      description="Complete your profile, accept the terms, verify identity, then save a payment method when needed."
      loading={loading}
    >
      {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}

      <Card style={{ marginBottom: 16 }} className="ge-onboarding-card">
        <Steps
          current={stepIndex(current)}
          items={items}
          className="ge-onboarding-steps"
          style={{ marginBottom: 12 }}
        />
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          {readinessLabel(me?.readiness)}
          {" · "}
          <Link to="/">Home</Link>
        </Paragraph>
      </Card>

      <OnboardingWizardStepPanel
        current={current}
        me={me}
        config={config}
        oidc={oidc}
        onAfterGate={() => void afterGate()}
      />
    </PageFrame>
  );
}
