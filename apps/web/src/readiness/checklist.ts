import type { ReadinessStatus } from "../api/me";

/**
 * Home readiness checklist for the participant portal (03 §6, REQ-049).
 * Steps mirror the readiness lifecycle in 02 §5 / BR-09.
 */

export type ChecklistItem = {
  id: "profile" | "terms" | "payment";
  label: string;
  done: boolean;
};

const ORDER: ReadinessStatus[] = [
  "Invited",
  "ProfileCompleted",
  "TermsAccepted",
  "Ready",
];

function rank(status: ReadinessStatus): number {
  const i = ORDER.indexOf(status);
  return i === -1 ? -1 : i;
}

/** Build the three onboarding gates from the current readiness status. */
export function readinessChecklist(status: ReadinessStatus): ChecklistItem[] {
  // Restricted / Offboarded: show gates as incomplete plus sticky state.
  if (status === "Restricted" || status === "Offboarded") {
    return [
      { id: "profile", label: "Complete billing profile", done: false },
      { id: "terms", label: "Accept terms (and self-billing if producer)", done: false },
      { id: "payment", label: "Complete payment setup", done: false },
    ];
  }

  const r = rank(status);
  return [
    {
      id: "profile",
      label: "Complete billing profile",
      done: r >= rank("ProfileCompleted"),
    },
    {
      id: "terms",
      label: "Accept terms (and self-billing if producer)",
      done: r >= rank("TermsAccepted"),
    },
    {
      id: "payment",
      label: "Complete payment setup",
      done: r >= rank("Ready"),
    },
  ];
}

export function readinessHeadline(status: ReadinessStatus): string {
  switch (status) {
    case "Ready":
      return "You are ready to bill and be billed";
    case "Restricted":
      return "Account restricted — payment or KYC block";
    case "Offboarded":
      return "Participant offboarded";
    default:
      return "Complete the steps below to become ready";
  }
}
