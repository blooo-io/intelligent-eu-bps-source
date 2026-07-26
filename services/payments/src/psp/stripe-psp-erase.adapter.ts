import { Injectable } from "@nestjs/common";
import type {
  PspEraseInput,
  PspErasePort,
  PspEraseResult,
} from "./psp-erase.port.js";
import { resolvePspProvider } from "./stripe-env.js";

/**
 * REQ-013 — Stripe test-mode erasure hook for AC-07.
 * V1 records the command; Connect account deletion is operator-driven in test.
 */
@Injectable()
export class StripePspEraseAdapter implements PspErasePort {
  private readonly calls: PspEraseInput[] = [];

  recorded(): readonly PspEraseInput[] {
    return [...this.calls];
  }

  async erase(input: PspEraseInput): Promise<PspEraseResult> {
    if (resolvePspProvider() !== "stripe") {
      throw new Error("Stripe erase adapter requires PSP_PROVIDER=stripe");
    }
    this.calls.push({ ...input });
    return {
      ok: true,
      requestId: input.requestId,
      participantId: input.participantId,
    };
  }
}
