import { ApiError } from "./me";

/**
 * Map API failures to short, actionable copy (INT-243).
 * Raw status strings stay in ApiError.message for logs/tests; the UI shows this.
 */
export function userFacingMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) {
      return "Your session expired. Sign out and sign in again.";
    }
    if (err.status === 403) {
      return "You do not have access to this screen. It is reserved for another role — use the menu for pages available to you.";
    }
    if (err.status === 404) {
      return "This resource was not found. Check that you are in the right community.";
    }
    if (err.status >= 500) {
      return "The service is temporarily unavailable. Try again in a moment.";
    }
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return "Something went wrong.";
}
