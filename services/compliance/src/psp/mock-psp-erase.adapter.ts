import { Injectable } from "@nestjs/common";
import type {
  PspEraseInput,
  PspErasePort,
  PspEraseResult,
} from "./psp-erase.port.js";

/** V1 mock Stripe erasure — records the command for UAT-013 / S12. */
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
    this.calls.push({ ...input });
    return {
      ok: true,
      requestId: input.requestId,
      participantId: input.participantId,
    };
  }
}
