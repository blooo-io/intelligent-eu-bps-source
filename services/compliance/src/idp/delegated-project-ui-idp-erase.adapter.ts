import type { IdpEraseInput, IdpEraseResult, IdpPort } from "./idp.port.js";

/**
 * INT-463 / REQ-013 — member IdP erase is owned by the project UI (R2M).
 * BPS records delegation; it does not call Keycloak Admin.
 */
export class DelegatedProjectUiIdpEraseAdapter implements IdpPort {
  private readonly calls: IdpEraseInput[] = [];

  recorded(): readonly IdpEraseInput[] {
    return [...this.calls];
  }

  async erase(input: IdpEraseInput): Promise<IdpEraseResult> {
    this.calls.push({ ...input });
    return {
      ok: true,
      requestId: input.requestId,
      participantId: input.participantId,
      outcome: "delegated_to_project_ui",
    };
  }
}
