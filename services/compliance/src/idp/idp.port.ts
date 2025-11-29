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
};

export interface IdpPort {
  erase(input: IdpEraseInput): Promise<IdpEraseResult>;
  recorded(): readonly IdpEraseInput[];
}
