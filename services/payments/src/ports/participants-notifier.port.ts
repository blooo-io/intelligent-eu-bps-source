import { resolveServiceAuthHeaders, type ServiceAuthSource } from "@intelligent/module-template";
/**
 * INT-193 — notify AC-03 of payment-account readiness (sync until NATS).
 */

export type PaymentAccountStatusNotice = {
  participantId: string;
  ready: boolean;
  reason?: string;
  /** INT-228 ignores an unknown participant. ANO-006 fails a member card sync. */
  notFound?: "ignore" | "fail";
};

export type ParticipantsNotifierPort = {
  applyPaymentAccountStatus(input: PaymentAccountStatusNotice): Promise<void>;
};

export const PARTICIPANTS_NOTIFIER = Symbol("PARTICIPANTS_NOTIFIER");

/** No-op for unit tests and when PARTICIPANTS_INTERNAL_URL is unset. */
export class NoopParticipantsNotifier implements ParticipantsNotifierPort {
  async applyPaymentAccountStatus(
    _input: PaymentAccountStatusNotice,
  ): Promise<void> {
    // intentionally empty
  }
}

/** HTTP bridge to AC-03 internal payment-account-status. */
export class HttpParticipantsNotifier implements ParticipantsNotifierPort {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly auth: ServiceAuthSource = null,
  ) {}

  async applyPaymentAccountStatus(input: PaymentAccountStatusNotice): Promise<void> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/internal/v1/participants/${input.participantId}/payment-account-status`;
    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: {
                "Content-Type": "application/json",
        ...(await resolveServiceAuthHeaders("ac-07-payments", this.auth)),

      },
      body: JSON.stringify({
        ready: input.ready,
        reason: input.reason,
      }),
    });
    // INT-228 — fixture / not-yet-registered producers (S1 UUIDs) return 404;
    // Connect provision must still succeed so Stripe remains the source of truth.
    // ANO-006 — a member who already has a card must not ignore that 404.
    if (res.status === 404) {
      if (input.notFound === "fail") {
        throw new Error(
          `participants payment-account-status failed with 404`,
        );
      }
      return;
    }
    if (!res.ok) {
      throw new Error(
        `participants payment-account-status failed with ${res.status}`,
      );
    }
  }
}
