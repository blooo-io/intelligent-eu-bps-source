/**
 * Public API clients for participant registry (REQ-008, REQ-012, REQ-058).
 */

import { ApiError } from "./me";

export type ParticipantRole = "consumer" | "producer" | "prosumer";

export type ParticipantImportRow = {
  email: string;
  marketActorId: string;
  meterId: string;
  role: ParticipantRole;
};

export type Participant = {
  participantId: string;
  communityId: string;
  role: ParticipantRole;
  status: string;
  marketActorId?: string;
  meterId?: string;
};

export type ParticipantPatch = {
  marketActorId?: string;
  meterId?: string;
  role?: ParticipantRole;
};

/** Parse CSV lines: email,marketActorId,meterId,role (header optional). */
export function parseParticipantCsv(text: string): ParticipantImportRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const rows: ParticipantImportRow[] = [];
  for (const line of lines) {
    if (/^email\s*,/i.test(line)) continue;
    const parts = line.split(",").map((p) => p.trim());
    if (parts.length < 4) {
      throw new Error(`Invalid CSV row: ${line}`);
    }
    const [email, marketActorId, meterId, roleRaw] = parts;
    const role = roleRaw as ParticipantRole;
    if (!["consumer", "producer", "prosumer"].includes(role)) {
      throw new Error(`Invalid role in CSV: ${roleRaw}`);
    }
    rows.push({ email, marketActorId, meterId, role });
  }
  if (rows.length === 0) {
    throw new Error("CSV has no participant rows");
  }
  return rows;
}

export async function listParticipants(
  apiBaseUrl: string,
  accessToken: string,
  communityId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Participant[]> {
  const res = await fetchImpl(
    `${apiBaseUrl.replace(/\/$/, "")}/v1/communities/${communityId}/participants`,
    {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );
  if (!res.ok) {
    throw new ApiError(
      res.status,
      `GET /v1/communities/{id}/participants failed with ${res.status}`,
    );
  }
  return (await res.json()) as Participant[];
}

export async function importParticipants(
  apiBaseUrl: string,
  accessToken: string,
  communityId: string,
  participants: ParticipantImportRow[],
  fetchImpl: typeof fetch = fetch,
): Promise<Participant[]> {
  const res = await fetchImpl(
    `${apiBaseUrl.replace(/\/$/, "")}/v1/communities/${communityId}/participants:import`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ participants }),
    },
  );
  if (!res.ok) {
    throw new ApiError(
      res.status,
      `POST /v1/communities/{id}/participants:import failed with ${res.status}`,
    );
  }
  return (await res.json()) as Participant[];
}

export async function patchParticipant(
  apiBaseUrl: string,
  accessToken: string,
  participantId: string,
  body: ParticipantPatch,
  fetchImpl: typeof fetch = fetch,
): Promise<Participant> {
  const res = await fetchImpl(
    `${apiBaseUrl.replace(/\/$/, "")}/v1/participants/${participantId}`,
    {
      method: "PATCH",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    throw new ApiError(
      res.status,
      `PATCH /v1/participants/{id} failed with ${res.status}`,
    );
  }
  return (await res.json()) as Participant;
}

export async function offboardParticipant(
  apiBaseUrl: string,
  accessToken: string,
  participantId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Participant> {
  const res = await fetchImpl(
    `${apiBaseUrl.replace(/\/$/, "")}/v1/participants/${participantId}:offboard`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );
  if (!res.ok) {
    throw new ApiError(
      res.status,
      `POST /v1/participants/{id}:offboard failed with ${res.status}`,
    );
  }
  return (await res.json()) as Participant;
}
