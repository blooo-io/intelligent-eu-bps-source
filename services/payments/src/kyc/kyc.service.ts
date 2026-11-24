/**
 * REQ-045 / REQ-051 / UAT-056 / UAT-063 — KYC readiness for every role and
 * KycStatusChanged emission (identifiers only, NFR-015).
 *
 * BillingModeResolver (plan Task 3.13) is not wired yet; envelopes use
 * `billingMode: "virtual"` until that resolver lands.
 */
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { OutboxService } from "@intelligent/module-template";
import {
  PaymentsStore,
  type AccountRecord,
  type KycStatus,
} from "../domain/store.js";
import {
  KYC_LOG_STORE,
  type KycLogEntry,
  type KycLogStore,
} from "../ports/kyc-log.store.js";
import {
  PAYMENT_ACCOUNTS_STORE,
  type PaymentAccountsStore,
} from "../ports/payment-accounts.store.js";
import type { LegacyOnboardingSession } from "../psp/psp.legacy.js";

const PRODUCER = "AC-07";

/**
 * REQ-045 — every role needs KYC; buyers (consumer, prosumer) also need a
 * payment method before the payment account is Ready.
 */
export function kycReady(a: AccountRecord): boolean {
  return a.kycVerified && (a.role === "producer" || Boolean(a.pspPaymentMethodRef));
}

/** UAT-056 — payouts need verified KYC and a verified payout account. */
export function canReceivePayout(a: AccountRecord): boolean {
  return a.kycVerified && a.payoutAccountVerified;
}

function statusFromSession(session: LegacyOnboardingSession): KycStatus {
  if (session.status === "complete") return "verified";
  if (session.disabledReason?.startsWith("rejected.")) return "rejected";
  return "pending";
}

@Injectable()
export class KycService {
  constructor(
    @Inject(PaymentsStore) private readonly store: PaymentsStore,
    @Inject(PAYMENT_ACCOUNTS_STORE)
    private readonly accountsStore: PaymentAccountsStore,
    @Inject(KYC_LOG_STORE) private readonly kycLog: KycLogStore,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {}

  /**
   * REQ-051 — apply a Connect account session to the billing KYC mirror,
   * append an audit log row, and emit KycStatusChanged when status flips.
   */
  async applyAccountSession(
    participantId: string,
    session: LegacyOnboardingSession,
    source: KycLogEntry["source"],
    pspEventId: string | null,
  ): Promise<AccountRecord> {
    const existing = this.store.getAccount(participantId)
      ?? (await this.accountsStore.get(participantId));
    if (!existing) {
      throw new NotFoundException("Unknown producer account");
    }

    const kycStatus = statusFromSession(session);
    const kycVerified = kycStatus === "verified";
    const payoutAccountVerified = session.payoutsEnabled === true;
    const previousStatus = existing.kycStatus;
    const previousPayout = existing.payoutAccountVerified;

    const kycVerifiedAt =
      kycVerified && !existing.kycVerifiedAt
        ? new Date().toISOString()
        : existing.kycVerifiedAt;

    const updated: AccountRecord = {
      ...existing,
      kycStatus,
      kycVerified,
      kycVerifiedAt: kycVerified ? kycVerifiedAt : existing.kycVerifiedAt,
      kycMethod: "connect_onboarding",
      payoutAccountVerified,
    };

    this.store.putAccount(updated);
    await this.accountsStore.put(updated);

    const entry: KycLogEntry = {
      logId: randomUUID(),
      subjectId: participantId,
      subjectType: "participant",
      at: new Date().toISOString(),
      source,
      pspEventId,
      kycStatus,
      requirementsDueCount: session.currentlyDue?.length ?? 0,
      errorCode: session.disabledReason ?? null,
    };
    await this.kycLog.append(entry);

    const changed =
      previousStatus !== kycStatus || previousPayout !== payoutAccountVerified;
    if (changed) {
      await this.outbox.append({
        aggregateType: "KycStatus",
        aggregateId: participantId,
        type: "KycStatusChanged",
        producer: PRODUCER,
        communityId: updated.communityId,
        billingMode: "virtual",
        data: {
          subjectId: participantId,
          subjectType: "participant",
          kycStatus,
          kycVerified,
          method: "connect_onboarding",
          payoutAccountVerified,
        },
      });
    }

    return { ...updated };
  }
}
