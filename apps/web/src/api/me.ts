/**
 * Public API client for GET /v1/me (contracts/openapi/public.v1.yaml).
 * AC-01 consumes only the public API (TP-8 / AD-7).
 */

export type ReadinessStatus =
  | "Invited"
  | "ProfileCompleted"
  | "TermsAccepted"
  | "Ready"
  | "Restricted"
  | "Offboarded";

export type BillingProfile = {
  name: string;
  address: string;
  email: string;
};

export type Me = {
  participantId: string;
  communityId: string;
  roles: string[];
  readiness: ReadinessStatus;
  profile: BillingProfile;
  billingMode?: string;
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Fetch the caller's profile and readiness with a bearer token (REQ-049). */
export async function fetchMe(
  apiBaseUrl: string,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Me> {
  const res = await fetchImpl(`${apiBaseUrl.replace(/\/$/, "")}/v1/me`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!res.ok) {
    throw new ApiError(res.status, `GET /v1/me failed with ${res.status}`);
  }
  return (await res.json()) as Me;
}
