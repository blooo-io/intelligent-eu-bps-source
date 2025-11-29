import { Injectable } from "@nestjs/common";
import type { IdpEraseInput, IdpEraseResult, IdpPort } from "./idp.port.js";

/** V1 mock IdP — records erasure commands; no network call. */
@Injectable()
export class MockIdpAdapter implements IdpPort {
  private readonly calls: IdpEraseInput[] = [];

  reset(): void {
    this.calls.length = 0;
  }

  recorded(): readonly IdpEraseInput[] {
    return [...this.calls];
  }

  async erase(input: IdpEraseInput): Promise<IdpEraseResult> {
    this.calls.push({ ...input });
    return {
      ok: true,
      requestId: input.requestId,
      participantId: input.participantId,
    };
  }
}
