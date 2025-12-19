/**
 * Public API clients for GDPR data-subject requests (REQ-013 / UAT-013).
 * POST /v1/data-subject-requests, GET /v1/data-subject-requests/{id}.
 */

import { ApiError } from "./me";

export type DataSubjectRequestType = "export" | "erasure";

export type DataSubjectRequest = {
  requestId: string;
  participantId: string;
  type: DataSubjectRequestType;
  status: string;
};

/** Open an export or erasure request for the signed-in member (REQ-013). */
export async function createDataSubjectRequest(
  apiBaseUrl: string,
  accessToken: string,
  body: { type: DataSubjectRequestType },
  fetchImpl: typeof fetch = fetch,
): Promise<DataSubjectRequest> {
  const res = await fetchImpl(
    `${apiBaseUrl.replace(/\/$/, "")}/v1/data-subject-requests`,
    {
      method: "POST",
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
      `POST /v1/data-subject-requests failed with ${res.status}`,
    );
  }
  return (await res.json()) as DataSubjectRequest;
}

/** Read status of one data-subject request. */
export async function getDataSubjectRequest(
  apiBaseUrl: string,
  accessToken: string,
  requestId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DataSubjectRequest> {
  const res = await fetchImpl(
    `${apiBaseUrl.replace(/\/$/, "")}/v1/data-subject-requests/${requestId}`,
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
      `GET /v1/data-subject-requests/{id} failed with ${res.status}`,
    );
  }
  return (await res.json()) as DataSubjectRequest;
}
