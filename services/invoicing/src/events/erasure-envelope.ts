import { asString } from "@intelligent/module-template";

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}


function parseJsonUnknown(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function unwrapDebeziumAfter(rec: Record<string, unknown>): Record<string, unknown> {
  if (rec.after === undefined || typeof rec.after !== "object") return rec;
  const after = asRecord(rec.after);
  if (after.event === undefined) return rec;
  const event =
    typeof after.event === "string" ? parseJsonUnknown(after.event) : after.event;
  return asRecord(event);
}

function unwrapLegacyIdEnvelope(rec: Record<string, unknown>): Record<string, unknown> {
  if (typeof rec.id !== "string" || rec.data === undefined || rec.eventId) {
    return rec;
  }
  const data = asRecord(rec.data);
  if (data.requestId) return rec;
  return data.eventId ? data : { eventId: rec.id, data };
}

export function unwrapEnvelope(payload: unknown): Record<string, unknown> {
  let cur: unknown = payload;
  if (typeof cur === "string") {
    const parsed = parseJsonUnknown(cur);
    if (parsed === undefined) return {};
    cur = parsed;
  }
  let rec = asRecord(cur);
  if (rec.payload !== undefined && rec.schema !== undefined) {
    rec = asRecord(rec.payload);
  }
  rec = unwrapDebeziumAfter(rec);
  return unwrapLegacyIdEnvelope(rec);
}

export function mapErasureRequestedEnvelope(payload: unknown): {
  eventId: string;
  requestId: string;
  participantId: string;
} {
  const envelope = unwrapEnvelope(payload);
  const data = asRecord(envelope.data);
  return {
    eventId: asString(envelope.eventId) || asString(envelope.id),
    requestId: asString(data.requestId) || asString(envelope.requestId),
    participantId: asString(data.participantId) || asString(envelope.participantId),
  };
}
