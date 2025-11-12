/** Narrow client of AC-03 CheckReadiness (BR-09). */
export interface ReadinessPort {
  check(participantId: string): Promise<{ ready: boolean; reason?: string }>;
}

export const READINESS_PORT = Symbol("READINESS_PORT");

export class AlwaysReadyReadiness implements ReadinessPort {
  async check(): Promise<{ ready: boolean }> {
    return { ready: true };
  }
}

export class MapReadiness implements ReadinessPort {
  constructor(private readonly readyById: Map<string, boolean>) {}

  async check(
    participantId: string,
  ): Promise<{ ready: boolean; reason?: string }> {
    const ready = this.readyById.get(participantId) ?? false;
    return ready
      ? { ready: true }
      : { ready: false, reason: "producer_not_ready" };
  }
}
