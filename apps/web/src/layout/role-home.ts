import type { ReadinessStatus } from "../api/me";

/**
 * INT-245 — role-aware Home copy (Impeccable Operate / clarify).
 * One job, one next action; no manager chrome for members.
 */

export type HomeAudience = "member" | "manager" | "operator" | "unknown";

export function homeAudience(roles: ReadonlyArray<string>): HomeAudience {
  if (roles.includes("manager")) return "manager";
  if (roles.includes("operator")) return "operator";
  if (roles.includes("member")) return "member";
  return "unknown";
}

export function homeTitle(audience: HomeAudience): string {
  switch (audience) {
    case "manager":
      return "Community console";
    case "operator":
      return "Operator desk";
    case "member":
      return "Your billing home";
    default:
      return "Home";
  }
}

export function homeDescription(audience: HomeAudience): string {
  switch (audience) {
    case "manager":
      return "Configure the community, invite participants, and start billing runs. Member payment screens stay in their own portal.";
    case "operator":
      return "Monitor reconciliation, intake anomalies and scheduled jobs for this environment.";
    case "member":
      return "Complete readiness, then review balances and pay invoices for your trades in this community.";
    default:
      return "Sign-in succeeded, but no billing role was found on your token. Ask an operator to assign member, manager or operator.";
  }
}

export type NextAction = {
  label: string;
  to: string;
  primary?: boolean;
};

/** Single next step for the current audience + readiness. */
export function homeNextAction(
  audience: HomeAudience,
  readiness?: ReadinessStatus,
): NextAction | null {
  if (audience === "manager") {
    return { label: "Open community settings", to: "/community-settings", primary: true };
  }
  if (audience === "operator") {
    return { label: "Open operator tools", to: "/operator", primary: true };
  }
  if (audience !== "member") return null;

  switch (readiness) {
    case "Ready":
      return { label: "View invoices", to: "/invoices", primary: true };
    case "TermsAccepted":
      return { label: "Finish payment setup", to: "/onboarding?step=payment", primary: true };
    case "ProfileCompleted":
      return { label: "Accept terms", to: "/onboarding?step=terms", primary: true };
    case "Restricted":
    case "Offboarded":
      return null;
    default:
      return { label: "Continue get ready", to: "/onboarding", primary: true };
  }
}
