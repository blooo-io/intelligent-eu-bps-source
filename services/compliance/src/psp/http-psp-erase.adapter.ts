import {
  resolveServiceAuthHeaders,
  type ServiceAuthSource,
} from "@intelligent/module-template";
import type {
  PspEraseInput,
  PspEraseOutcome,
  PspErasePort,
  PspEraseResult,
} from "./psp-erase.port.js";

/**
 * REQ-013 / Task 3.21 — call AC-07 `POST /internal/v1/payment-accounts/{id}:erase-at-psp`.
 */
export class HttpPspEraseAdapter implements PspErasePort {
  private readonly calls: PspEraseInput[] = [];

  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly auth: ServiceAuthSource = null,
  ) {}

  recorded(): readonly PspEraseInput[] {
    return [...this.calls];
  }

  async erase(input: PspEraseInput): Promise<PspEraseResult> {
    this.calls.push({ ...input });
    const url = `${trim(this.baseUrl)}/internal/v1/payment-accounts/${input.participantId}:erase-at-psp`;
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
      const body = (await res.json()) as {
        outcome?: PspEraseOutcome;
        reason?: "aml_legal_obligation";
      };
      const outcome = body.outcome;
      if (
        outcome !== "erased" &&
        outcome !== "retained_by_psp" &&
        outcome !== "nothing_to_erase"
      ) {
        return {
          ok: false,
          requestId: input.requestId,
          participantId: input.participantId,
        };
      }
      return {
        ok: true,
        requestId: input.requestId,
        participantId: input.participantId,
        outcome,
        reason: body.reason,
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
