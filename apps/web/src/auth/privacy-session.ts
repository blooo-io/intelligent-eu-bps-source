/** INT-256 / INT-336 — last privacy request in this tab. Cleared on logout. */
export const PRIVACY_REQUEST_KEY = "int.privacy.currentRequest";

/** REQ-013 — a signed-out or switched account must not keep the previous request. */
export function clearPrivacySession(): void {
  try {
    sessionStorage.removeItem(PRIVACY_REQUEST_KEY);
  } catch {
    // Private mode or a non-browser test runner.
  }
}
