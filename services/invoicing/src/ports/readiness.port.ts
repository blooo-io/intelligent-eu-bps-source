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

/**
 * INT-231 — HTTP CheckReadiness against AC-03.
 * Used when PARTICIPANTS_INTERNAL_URL is set (cluster / integration).
 */
export class HttpReadiness implements ReadinessPort {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async check(
    participantId: string,
  ): Promise<{ ready: boolean; reason?: string }> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/internal/v1/participants/${participantId}/readiness`;
    const res = await this.fetchImpl(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "x-intelligent-roles": "service",
        "x-intelligent-sub": "ac-06-invoicing",
      },
    });
    if (res.status === 404) {
      return { ready: false, reason: "producer_not_ready" };
    }
    if (!res.ok) {
      throw new Error(
        `participants checkReadiness ${participantId} failed with ${res.status}`,
      );
    }
    const body = (await res.json()) as {
      ready?: boolean;
      reason?: string;
    };
    if (body.ready === true) {
      return { ready: true };
    }
    return {
      ready: false,
      reason: body.reason ?? "producer_not_ready",
    };
  }
}

export function createReadiness(
  env: NodeJS.ProcessEnv = process.env,
): ReadinessPort {
  const base = env.PARTICIPANTS_INTERNAL_URL;
  if (base) {
    return new HttpReadiness(base);
  }
  // Unit tests / local without AC-03 — fail-open like V1 fixture path.
  return new AlwaysReadyReadiness();
}
