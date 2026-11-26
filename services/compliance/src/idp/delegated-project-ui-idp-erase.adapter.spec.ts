import { describe, expect, it } from "vitest";
import { DelegatedProjectUiIdpEraseAdapter } from "./delegated-project-ui-idp-erase.adapter.js";

describe("DelegatedProjectUiIdpEraseAdapter (INT-463 / REQ-013)", () => {
  it("records the call and returns delegated_to_project_ui without calling Keycloak", async () => {
    const adapter = new DelegatedProjectUiIdpEraseAdapter();
    const input = {
      requestId: "req-1",
      participantId: "11111111-2222-4333-8444-555555555555",
      externalSubjectId: "kc-sub",
    };
    const result = await adapter.erase(input);
    expect(result).toEqual({
      ok: true,
      requestId: "req-1",
      participantId: "11111111-2222-4333-8444-555555555555",
      outcome: "delegated_to_project_ui",
    });
    expect(adapter.recorded()).toEqual([input]);
  });
});
