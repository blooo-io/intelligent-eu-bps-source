import type { ReadinessStatus } from "../api/me";

/** Human labels for readiness (INT-248 — no raw enum codes in the UI). */
export function readinessLabel(status?: ReadinessStatus): string {
  switch (status) {
    case "Invited":
      return "Invited — complete your profile";
    case "ProfileCompleted":
      return "Profile saved — accept the terms";
    case "TermsAccepted":
      return "Terms accepted — set up payment";
    case "Ready":
      return "Ready to bill and pay";
    case "Restricted":
      return "Account restricted";
    case "Offboarded":
      return "Offboarded";
    default:
      return status ? String(status) : "Unknown";
  }
}
