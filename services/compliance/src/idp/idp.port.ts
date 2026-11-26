/** Port to the identity provider for GDPR erasure (REQ-013 / P-IDP). */
export const IDP_PORT = Symbol("IDP_PORT");

export type IdpEraseInput = {
  participantId: string;
  /** External IdP subject id when known — identifiers only. */
  externalSubjectId?: string;
  requestId: string;
};

export type IdpEraseResult = {
  ok: boolean;
  requestId: string;
  participantId: string;
  /** INT-463 — member Keycloak erase is R2M's responsibility. */
  outcome?: "deleted" | "delegated_to_project_ui" | "failed";
};

export interface IdpPort {
  erase(input: IdpEraseInput): Promise<IdpEraseResult>;
  recorded(): readonly IdpEraseInput[];
}
