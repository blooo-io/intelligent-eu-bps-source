/** Claims re-checked by every module after APISIX (04 §7, REQ-010). */
export type AuthClaims = {
  sub: string;
  roles: string[];
  communityId: string;
  /** Service accounts use client-credentials tokens without a participant subject scope. */
  tokenUse: "user" | "service";
};

export type AuthenticatedRequest = {
  user?: AuthClaims;
};
