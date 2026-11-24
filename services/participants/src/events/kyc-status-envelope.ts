import { asString } from "@intelligent/module-template";
import { unwrapEnvelope } from "./erasure-envelope.js";

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

/** Map a KycStatusChanged envelope (AC-07) to identifiers only (NFR-015). */
export function mapKycStatusChangedEnvelope(payload: unknown): {
  eventId: string;
  subjectId: string;
  subjectType: string;
  kycVerified: boolean;
} {
  const envelope = unwrapEnvelope(payload);
  const data = asRecord(envelope.data);
  return {
    eventId: asString(envelope.eventId) || asString(envelope.id),
    subjectId: asString(data.subjectId) || asString(envelope.subjectId),
    subjectType: asString(data.subjectType) || asString(envelope.subjectType),
    kycVerified: data.kycVerified === true || envelope.kycVerified === true,
  };
}
