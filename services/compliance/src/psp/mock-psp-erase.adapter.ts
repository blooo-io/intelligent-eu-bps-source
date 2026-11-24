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
  private nextResult: Partial<PspEraseResult> | null = null;

  reset(): void {
    this.calls.length = 0;
    this.nextResult = null;
  }

  /** Test helper — next erase() returns this partial result. */
  stubNext(result: Partial<PspEraseResult>): void {
    this.nextResult = result;
  }

  recorded(): readonly PspEraseInput[] {
    return [...this.calls];
  }

  async erase(input: PspEraseInput): Promise<PspEraseResult> {
    this.calls.push({ ...input });
    const stub = this.nextResult;
    this.nextResult = null;
    return {
      ok: stub?.ok ?? true,
      requestId: input.requestId,
      participantId: input.participantId,
      outcome: stub?.outcome ?? "erased",
      reason: stub?.reason,
    };
  }
}
