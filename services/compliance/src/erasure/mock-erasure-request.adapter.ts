import type {
  ErasureOutcomeReport,
  ErasureRequestPort,
  InboundErasureRequest,
} from "./erasure-request.port.js";

/**
 * V1 mock EWDS erasure feed (REQ-013 / Task 3.22).
 * Tests push requests via {@link push}; outcomes are recorded for assertion.
 */
export class MockErasureRequestAdapter implements ErasureRequestPort {
  private handler: ((r: InboundErasureRequest) => Promise<void>) | null = null;
  private readonly reported: Array<{
    externalRequestId: string;
    outcome: ErasureOutcomeReport;
  }> = [];

  onRequest(handler: (r: InboundErasureRequest) => Promise<void>): void {
    this.handler = handler;
  }

  async reportOutcome(
    externalRequestId: string,
    outcome: ErasureOutcomeReport,
  ): Promise<void> {
    this.reported.push({ externalRequestId, outcome });
  }

  /** Test helper — deliver an inbound EWDS erasure request. */
  async push(request: InboundErasureRequest): Promise<void> {
    if (!this.handler) {
      throw new Error("No erasure request handler registered");
    }
    await this.handler(request);
  }

  outcomes(): readonly {
    externalRequestId: string;
    outcome: ErasureOutcomeReport;
  }[] {
    return [...this.reported];
  }

  reset(): void {
    this.reported.length = 0;
  }
}
