/**
 * Operator APIs: anomalies, discrepancies, jobs (REQ-029, REQ-041).
 */

import { ApiError } from "./me";

export type Discrepancy = {
  scope: "invoice" | "market";
  expected: string;
  actual: string;
  status?: string;
};

export type IntakeAnomaly = {
  type: string;
  marketId: string;
  details?: string;
};

export type Job = {
  jobId: string;
  name: string;
  communityId?: string;
  outcome?: string;
  lastRunAt?: string;
};

function withOptionalCommunity(base: string, communityId?: string): string {
  if (!communityId) return base;
  const qs = new URLSearchParams({ communityId });
  return `${base}?${qs.toString()}`;
}

export async function listDiscrepancies(
  apiBaseUrl: string,
  accessToken: string,
  communityId?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Discrepancy[]> {
  const url = withOptionalCommunity(
    `${apiBaseUrl.replace(/\/$/, "")}/v1/reconciliation/discrepancies`,
    communityId,
  );
  const res = await fetchImpl(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!res.ok) {
    throw new ApiError(
      res.status,
      `GET /v1/reconciliation/discrepancies failed with ${res.status}`,
    );
  }
  return (await res.json()) as Discrepancy[];
}

export async function listIntakeAnomalies(
  apiBaseUrl: string,
  accessToken: string,
  communityId?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<IntakeAnomaly[]> {
  const url = withOptionalCommunity(
    `${apiBaseUrl.replace(/\/$/, "")}/v1/intake/anomalies`,
    communityId,
  );
  const res = await fetchImpl(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!res.ok) {
    throw new ApiError(
      res.status,
      `GET /v1/intake/anomalies failed with ${res.status}`,
    );
  }
  return (await res.json()) as IntakeAnomaly[];
}

export async function listJobs(
  apiBaseUrl: string,
  accessToken: string,
  communityId?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Job[]> {
  const url = withOptionalCommunity(
    `${apiBaseUrl.replace(/\/$/, "")}/v1/jobs`,
    communityId,
  );
  const res = await fetchImpl(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!res.ok) {
    throw new ApiError(res.status, `GET /v1/jobs failed with ${res.status}`);
  }
  return (await res.json()) as Job[];
}

export async function runJob(
  apiBaseUrl: string,
  accessToken: string,
  jobId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Job> {
  const res = await fetchImpl(
    `${apiBaseUrl.replace(/\/$/, "")}/v1/jobs/${jobId}:run`,
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
      `POST /v1/jobs/{id}:run failed with ${res.status}`,
    );
  }
  return (await res.json()) as Job;
}
