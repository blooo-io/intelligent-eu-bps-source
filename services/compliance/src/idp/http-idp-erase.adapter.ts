import {
  resolveServiceAuthHeaders,
  type ServiceAuthSource,
} from "@intelligent/module-template";
import type { IdpEraseInput, IdpEraseResult, IdpPort } from "./idp.port.js";

/**
 * REQ-013 / Task 3.21 — call AC-03 `POST /internal/v1/participants/{id}:erase-identity`.
 */
export class HttpIdpEraseAdapter implements IdpPort {
  private readonly calls: IdpEraseInput[] = [];

  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly auth: ServiceAuthSource = null,
  ) {}

  recorded(): readonly IdpEraseInput[] {
    return [...this.calls];
  }

  async erase(input: IdpEraseInput): Promise<IdpEraseResult> {
    this.calls.push({ ...input });
    const url = `${trim(this.baseUrl)}/internal/v1/participants/${input.participantId}:erase-identity`;
    try {
      const res = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          ...(await resolveServiceAuthHeaders("ac-12-compliance", this.auth)),
        },
      });
      if (!res.ok) {
        return {
          ok: false,
          requestId: input.requestId,
          participantId: input.participantId,
        };
      }
      const body = (await res.json()) as { erased?: boolean };
      return {
        ok: body.erased === true,
        requestId: input.requestId,
        participantId: input.participantId,
      };
    } catch {
      return {
        ok: false,
        requestId: input.requestId,
        participantId: input.participantId,
      };
    }
  }
}

function trim(base: string): string {
  return base.replace(/\/$/, "");
}
