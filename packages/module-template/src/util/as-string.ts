/** Safe string coercion for unknown event / JSON fields (Sonar S6551). */
export function asString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }
  return fallback;
}
