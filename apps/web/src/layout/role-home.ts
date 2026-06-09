import type { ReadinessStatus } from "../api/me";

/**
 * INT-245 / INT-250 — role-aware Home copy.
 * One job, one next action; money-first when the member is Ready.
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
      return "Community pulse";
    case "operator":
      return "Operator desk";
    case "member":
      return "Home";
    default:
      return "Home";
  }
}

export function homeDescription(
  audience: HomeAudience,
  readiness?: ReadinessStatus,
  communityLabel?: string | null,
): string {
  const community = communityLabel ?? "your community";
  switch (audience) {
    case "manager":
      return `Configure ${community}, invite members, and start billing runs.`;
    case "operator":
      return "Monitor reconciliation, intake anomalies and scheduled jobs.";
    case "member":
      if (readiness === "Ready") {
        return `You are ready in ${community}. Review balances and pay open invoices.`;
      }
      return `Finish setup once, then settle your trades in ${community}.`;
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
    return { label: "Start billing run", to: "/billing-runs", primary: true };
  }
  if (audience === "operator") {
    return { label: "Open operator tools", to: "/operator", primary: true };
  }
  if (audience !== "member") return null;

  switch (readiness) {
    case "Ready":
      return { label: "Pay open invoices", to: "/invoices", primary: true };
    case "TermsAccepted":
      return { label: "Finish payment setup", to: "/onboarding?step=payment", primary: true };
    case "ProfileCompleted":
      return { label: "Accept terms", to: "/onboarding?step=terms", primary: true };
    case "Restricted":
    case "Offboarded":
      return null;
    default:
      return { label: "Continue setup", to: "/onboarding", primary: true };
  }
}
