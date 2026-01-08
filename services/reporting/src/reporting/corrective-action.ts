/**
 * Suggested corrective actions for failed payments (REQ-046 / KPI UE-3).
 * Mapped from failureCategory projected from AC-07.
 */
export function suggestedCorrectiveAction(
  failureCategory: string | undefined,
): string {
  if (!failureCategory) return "";
  const key = failureCategory.toLowerCase();
  if (key.includes("insufficient")) {
    return "Retry after the consumer tops up or use another payment method";
  }
  if (key.includes("authentication") || key.includes("3ds")) {
    return "Complete strong customer authentication and retry";
  }
  if (key.includes("declin") || key.includes("card")) {
    return "Ask the consumer to use another card or contact their bank";
  }
  return "Review the failure category, then retry or contact support";
}
