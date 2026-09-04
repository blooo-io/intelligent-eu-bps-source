const EMAIL =
  /\b[A-Z0-9._%+-]{1,64}@[A-Z0-9.-]{1,255}\.[A-Z]{2,63}\b/gi;
const IBAN = /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g;

const SENSITIVE_KEYS = new Set([
  "email",
  "name",
  "fullName",
  "firstName",
  "lastName",
  "iban",
  "address",
  "phone",
]);

/**
 * Strip personal data from structured log fields (NFR-015 / REQ-030).
 * Identifiers (uuids, Stripe ids) are left untouched.
 */
export function redactPersonalData(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(EMAIL, "[redacted-email]").replace(IBAN, "[redacted-iban]");
  }
  if (Array.isArray(value)) {
    return value.map(redactPersonalData);
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(key)) {
        out[key] = "[redacted]";
        continue;
      }
      out[key] = redactPersonalData(nested);
    }
    return out;
  }
  return value;
}
