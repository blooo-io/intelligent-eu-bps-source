import type { ParticipantRole, ReadinessStatus } from "../api/me";

/**
 * INT-245 / INT-250 / INT-252 — role-aware Home copy.
 * IdP audience (member/manager/operator) + market role (consumer/producer).
 * One job, one next action; money-first when the member is Ready.
 */

export type HomeAudience = "member" | "manager" | "operator" | "unknown";

/** Seller-side market roles (self-billing / Connect payouts). */
export function isSellerRole(role?: ParticipantRole | null): boolean {
  return role === "producer" || role === "prosumer";
}

export function marketRoleLabel(role?: ParticipantRole | null): string | null {
  switch (role) {
    case "consumer":
      return "Consumer";
    case "producer":
      return "Producer";
    case "prosumer":
      return "Prosumer";
    default:
      return null;
  }
}

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
  marketRole?: ParticipantRole | null,
): string {
  const community = communityLabel ?? "your community";
  switch (audience) {
    case "manager":
      return "Who is ready, what is open, when the next run should start.";
    case "operator":
      return "Platform health only — not a member or manager portal.";
    case "member":
      if (readiness === "Ready") {
        // INT-269 — prosumer buys and sells (P1 when buying).
        if (marketRole === "prosumer") {
          return `You buy and sell in ${community}. Pay when you owe; receive payouts when owed.`;
        }
        if (isSellerRole(marketRole)) {
          return `You sell energy in ${community}. Invoices are issued in your name (self-billing).`;
        }
        return `You buy energy in ${community}. Next: settle what you owe.`;
      }
      if (marketRole === "prosumer") {
        return `Finish Connect KYC and a card once, then settle trades both ways in ${community}.`;
      }
      if (isSellerRole(marketRole)) {
        return `Finish setup once, then receive payouts for trades in ${community}.`;
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

/** Single next step for the current audience + readiness + market role. */
export function homeNextAction(
  audience: HomeAudience,
  readiness?: ReadinessStatus,
  marketRole?: ParticipantRole | null,
): NextAction | null {
  if (audience === "manager") {
    return { label: "Start billing run", to: "/billing-runs", primary: true };
  }
  if (audience === "operator") {
    return { label: "Open operator desk", to: "/operator", primary: true };
  }
  if (audience !== "member") return null;

  switch (readiness) {
    case "Ready":
      // INT-269 — prosumer may need to pay or review issued invoices.
      if (marketRole === "prosumer") {
        return {
          label: "Open invoices",
          to: "/invoices",
          primary: true,
        };
      }
      return isSellerRole(marketRole)
        ? { label: "Review open invoices", to: "/invoices", primary: true }
        : { label: "Pay open invoices", to: "/invoices", primary: true };
    case "TermsAccepted":
      return {
        label:
          marketRole === "prosumer"
            ? "Finish payouts and card"
            : isSellerRole(marketRole)
              ? "Open Stripe Connect"
              : "Finish payment setup",
        to: "/onboarding?step=payment",
        primary: true,
      };
    case "ProfileCompleted":
      return { label: "Accept terms", to: "/onboarding?step=terms", primary: true };
    case "Restricted":
    case "Offboarded":
      return null;
    default:
      return { label: "Continue setup", to: "/onboarding", primary: true };
  }
}
