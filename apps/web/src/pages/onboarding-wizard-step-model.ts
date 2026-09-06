import type { Me } from "../api/me";
import { isSellerRole } from "../layout/role-home";
import { stepFromReadiness, stepIndex, type WizardStepKey } from "./use-onboarding-wizard";

export type WizardStepStatus = "finish" | "process" | "wait";

export function wizardStepStatus(
  me: Me | null,
  current: WizardStepKey,
  stepKey: WizardStepKey,
  completedAfterIndex: number,
): WizardStepStatus {
  if (me && stepIndex(stepFromReadiness(me.readiness)) > completedAfterIndex) {
    return "finish";
  }
  if (current === stepKey) {
    return "process";
  }
  return "wait";
}

export function wizardPaymentStepTitle(role: Me["role"] | undefined): string {
  if (role === "prosumer") {
    return "Payouts & pay";
  }
  if (isSellerRole(role)) {
    return "Payouts";
  }
  return "Pay";
}

export function wizardPaymentStepDescription(role: Me["role"] | undefined): string {
  if (role === "prosumer") {
    return "Connect + card";
  }
  if (isSellerRole(role)) {
    return "Stripe Connect";
  }
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
  return [
    {
      title: "Profile",
      description: "Billing identity",
      status: wizardStepStatus(me, current, "profile", 0),
    },
    {
      title: "Terms",
      description: "Accept & self-billing",
      status: wizardStepStatus(me, current, "terms", 1),
    },
    {
      title: wizardPaymentStepTitle(me?.role),
      description: wizardPaymentStepDescription(me?.role),
      status: wizardPaymentStepStatus(me, current),
    },
  ];
}
