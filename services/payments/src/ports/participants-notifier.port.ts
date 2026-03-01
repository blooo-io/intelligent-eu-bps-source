/**
 * INT-193 — notify AC-03 of payment-account readiness (sync until NATS).
 */

export type ParticipantsNotifierPort = {
  applyPaymentAccountStatus(input: {
    participantId: string;
    ready: boolean;
    reason?: string;
  }): Promise<void>;
};

export const PARTICIPANTS_NOTIFIER = Symbol("PARTICIPANTS_NOTIFIER");

/** No-op for unit tests and when PARTICIPANTS_INTERNAL_URL is unset. */
export class NoopParticipantsNotifier implements ParticipantsNotifierPort {
  async applyPaymentAccountStatus(): Promise<void> {
    // intentionally empty
  }
}

/** HTTP bridge to AC-03 internal payment-account-status. */
export class HttpParticipantsNotifier implements ParticipantsNotifierPort {
  constructor(
    private readonly baseUrl: string,
    private readonly serviceToken: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async applyPaymentAccountStatus(input: {
    participantId: string;
    ready: boolean;
    reason?: string;
  }): Promise<void> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/internal/v1/participants/${input.participantId}/payment-account-status`;
    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.serviceToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "x-intelligent-roles": "service",
        "x-intelligent-sub": "ac-07-payments",
      },
      body: JSON.stringify({
        ready: input.ready,
        reason: input.reason,
      }),
    });
    if (!res.ok) {
      throw new Error(
        `participants payment-account-status failed with ${res.status}`,
      );
    }
  }
}
