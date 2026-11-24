import type { Me } from "../api/me";
import { isSellerRole } from "../layout/role-home";
import {
  stepFromReadiness,
  stepIndex,
  wizardIncludesPaymentStep,
  type WizardStepKey,
} from "./use-onboarding-wizard";

export type WizardStepStatus = "finish" | "process" | "wait";

export function wizardStepStatus(
  me: Me | null,
  current: WizardStepKey,
  stepKey: WizardStepKey,
  completedAfterIndex: number,
): WizardStepStatus {
  if (me && stepIndex(stepFromReadiness(me)) > completedAfterIndex) {
    return "finish";
  }
  if (current === stepKey) {
    return "process";
  }
  return "wait";
}

export function wizardTermsStepDescription(
  role: Me["role"] | undefined,
): string {
  return isSellerRole(role) ? "Accept & self-billing" : "Accept terms";
}

export function wizardIdentityStepStatus(
  me: Me | null,
  current: WizardStepKey,
): WizardStepStatus {
  if (me?.kycVerified || me?.readiness === "Ready") {
    return "finish";
  }
  if (current === "identity") {
    return "process";
  }
  return "wait";
}

/** Card step title — only shown for consumer / prosumer (INT-429). */
export function wizardPaymentStepTitle(_role: Me["role"] | undefined): string {
  return "Pay";
}

export function wizardPaymentStepDescription(
  _role: Me["role"] | undefined,
): string {
  return "Card";
}

export function wizardPaymentStepStatus(
  me: Me | null,
  current: WizardStepKey,
): WizardStepStatus {
  if (me?.readiness === "Ready") {
    return "finish";
  }
  if (current === "payment") {
    return "process";
  }
  return "wait";
}

export function wizardStepItems(me: Me | null, current: WizardStepKey) {
  const items = [
    {
      title: "Profile",
      description: "Billing identity",
      status: wizardStepStatus(me, current, "profile", 0),
    },
    {
      title: "Terms",
      description: wizardTermsStepDescription(me?.role),
      status: wizardStepStatus(me, current, "terms", 1),
    },
    {
      title: "Identity",
      description: "Stripe Connect KYC",
      status: wizardIdentityStepStatus(me, current),
    },
  ];

  if (wizardIncludesPaymentStep(me?.role)) {
    items.push({
      title: wizardPaymentStepTitle(me?.role),
      description: wizardPaymentStepDescription(me?.role),
      status: wizardPaymentStepStatus(me, current),
    });
  }

  return items;
}
