import { Injectable } from "@nestjs/common";
import type {
  PspEraseInput,
  PspErasePort,
  PspEraseResult,
} from "./psp-erase.port.js";

/** V1 mock Stripe erasure — records the command for REQ-013 / INT-275. */
@Injectable()
export class MockPspEraseAdapter implements PspErasePort {
  private readonly calls: PspEraseInput[] = [];

  reset(): void {
    this.calls.length = 0;
  }

  recorded(): readonly PspEraseInput[] {
    return [...this.calls];
  }

  async erase(input: PspEraseInput): Promise<PspEraseResult> {
    this.calls.push({
      ...input,
      platformCustomerIds: [...input.platformCustomerIds],
      connectedCustomers: input.connectedCustomers.map((c) => ({ ...c })),
    });
    const hasCustomers =
      input.platformCustomerIds.length > 0 ||
      input.connectedCustomers.length > 0;
    const hasAccount = Boolean(input.pspAccountRef);
    if (!hasCustomers && !hasAccount) {
      return {
        ok: true,
        requestId: input.requestId,
        participantId: input.participantId,
        outcome: "nothing_to_erase",
      };
    }
    if (input.livemode && hasAccount) {
      return {
        ok: true,
        requestId: input.requestId,
        participantId: input.participantId,
        outcome: "retained_by_psp",
        reason: "aml_legal_obligation",
      };
    }
    return {
      ok: true,
      requestId: input.requestId,
      participantId: input.participantId,
      outcome: "erased",
    };
  }
}
