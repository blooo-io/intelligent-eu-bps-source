function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

export function unwrapEnvelope(payload: unknown): Record<string, unknown> {
  let cur: unknown = payload;
  if (typeof cur === "string") {
    try {
      cur = JSON.parse(cur);
    } catch {
      return {};
    }
  }
  let rec = asRecord(cur);
  if (rec.payload !== undefined && rec.schema !== undefined) {
    rec = asRecord(rec.payload);
  }
  if (rec.after !== undefined && typeof rec.after === "object") {
    const after = asRecord(rec.after);
    if (after.event !== undefined) {
      const event =
        typeof after.event === "string"
          ? JSON.parse(String(after.event))
          : after.event;
      rec = asRecord(event);
    }
  }
  if (
    typeof rec.id === "string" &&
    rec.data !== undefined &&
    !rec.eventId &&
    !asRecord(rec.data).requestId
  ) {
    const data = asRecord(rec.data);
    rec = data.eventId ? data : { eventId: rec.id, data };
  }
  return rec;
}

export function mapErasureRequestedEnvelope(payload: unknown): {
  eventId: string;
  requestId: string;
  participantId: string;
} {
  const envelope = unwrapEnvelope(payload);
  const data = asRecord(envelope.data);
  return {
    eventId: String(envelope.eventId ?? envelope.id ?? ""),
    requestId: String(data.requestId ?? envelope.requestId ?? ""),
    participantId: String(data.participantId ?? envelope.participantId ?? ""),
  };
}
