/**
 * REQ-051 / A5 / UAT-063 — Stripe Identity for community managers (no Connect).
 *
 * REQ-043 — KycStatusChanged.billingMode comes from BillingModeResolver.
 */
import { Inject, Injectable, Optional } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  BILLING_MODE_RESOLVER,
  IdempotentConsumer,
  OutboxService,
  StaticBillingModeResolver,
  type BillingModeResolver,
} from "@intelligent/module-template";
import type { KycStatus } from "../domain/store.js";
import {
  KYC_LOG_STORE,
  type KycLogEntry,
  type KycLogStore,
} from "../ports/kyc-log.store.js";
import {
  MANAGER_KYC_STORE,
  type ManagerKycRecord,
  type ManagerKycStore,
} from "../ports/manager-kyc.store.js";
import {
  PAYMENT_ACCOUNTS_STORE,
  type PaymentAccountsStore,
} from "../ports/payment-accounts.store.js";
import {
  KYC_ONBOARDING_PORT,
  type KycOnboardingPort,
} from "../psp/kyc-onboarding.port.js";

const PRODUCER = "AC-07";

export type PublicKycStatus = {
  subjectId: string;
  subjectType: "participant" | "manager";
  kycStatus: KycStatus;
  kycVerified: boolean;
  method: "connect_onboarding" | "identity_document";
  updatedAt: string;
  payoutAccountVerified?: boolean;
};

function mapIdentityEventToStatus(eventType: string): KycStatus {
  if (eventType.endsWith(".verified") || eventType === "verified") {
    return "verified";
  }
  if (eventType.endsWith(".canceled") || eventType === "canceled") {
    return "rejected";
  }
  // requires_input / processing / anything else → pending
  return "pending";
}

@Injectable()
export class ManagerKycService {
  constructor(
    @Inject(MANAGER_KYC_STORE) private readonly store: ManagerKycStore,
    @Inject(KYC_ONBOARDING_PORT) private readonly kycPort: KycOnboardingPort,
    @Inject(KYC_LOG_STORE) private readonly kycLog: KycLogStore,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(IdempotentConsumer) private readonly consumer: IdempotentConsumer,
    @Optional()
    @Inject(BILLING_MODE_RESOLVER)
    private readonly billingMode: BillingModeResolver | null = null,
  ) {}

  /**
   * REQ-051 — start hosted Identity verification. Managers get no Connect account.
   */
  async start(
    subjectId: string,
    communityId: string,
    returnUrl: string,
  ): Promise<{ verificationId: string; url: string; status: KycStatus }> {
    const session = await this.kycPort.createIdentityVerification({
      subjectId,
      returnUrl,
    });
    const now = new Date().toISOString();
    const record: ManagerKycRecord = {
      subjectId,
      communityId,
      verificationId: session.verificationId,
      kycStatus: "pending",
      kycVerified: false,
      updatedAt: now,
    };
    await this.store.put(record);
    return {
      verificationId: session.verificationId,
      url: session.url,
      status: "pending",
    };
  }

  /**
   * REQ-051 — apply an Identity verification_session webhook.
   * Mapping: verified → verified, requires_input → pending, canceled → rejected.
   */
  async onIdentityEvent(
    eventId: string,
    verificationId: string,
    eventType: string,
  ): Promise<void> {
    const result = await this.consumer.handle(
      `identity:${eventId}`,
      { verificationId, eventType },
      async () => {
        await this.applyIdentityEvent(verificationId, eventType, eventId);
      },
    );
    if (result.status === "failed") {
      throw result.error;
    }
  }

  private async applyIdentityEvent(
    verificationId: string,
    eventType: string,
    pspEventId: string,
  ): Promise<void> {
    // Find the manager row by verification id (scan via get after we know subject).
    // Store is keyed by subjectId; look up by walking known ids from verification metadata.
    const record = await this.findByVerificationId(verificationId);
    if (!record) {
      return;
    }
    const kycStatus = mapIdentityEventToStatus(eventType);
    const kycVerified = kycStatus === "verified";
    const previousStatus = record.kycStatus;
    const updated: ManagerKycRecord = {
      ...record,
      kycStatus,
      kycVerified,
      updatedAt: new Date().toISOString(),
    };
    await this.store.put(updated);

    const entry: KycLogEntry = {
      logId: randomUUID(),
      subjectId: record.subjectId,
      subjectType: "manager",
      at: updated.updatedAt,
      source: "webhook",
      pspEventId,
      kycStatus,
      requirementsDueCount: 0,
      errorCode: null,
    };
    await this.kycLog.append(entry);

    if (previousStatus !== kycStatus) {
      const resolver =
        this.billingMode ?? new StaticBillingModeResolver("virtual");
      // REQ-043 — community live|virtual from AC-03 settings.
      const billingMode = await resolver.modeOf(record.communityId);
      await this.outbox.append({
        aggregateType: "KycStatus",
        aggregateId: record.subjectId,
        type: "KycStatusChanged",
        producer: PRODUCER,
        communityId: record.communityId,
        billingMode,
        data: {
          subjectId: record.subjectId,
          subjectType: "manager",
          kycStatus,
          kycVerified,
          method: "identity_document",
          payoutAccountVerified: false,
        },
      });
    }
  }

  private async findByVerificationId(
    verificationId: string,
  ): Promise<ManagerKycRecord | undefined> {
    return this.store.getByVerificationId(verificationId);
  }

  async getRecord(subjectId: string): Promise<ManagerKycRecord | undefined> {
    return this.store.get(subjectId);
  }
}

/** REQ-045 / REQ-051 — participants first, then managers. */
@Injectable()
export class KycQueryService {
  constructor(
    @Inject(PAYMENT_ACCOUNTS_STORE)
    private readonly accounts: PaymentAccountsStore,
    @Inject(MANAGER_KYC_STORE) private readonly managers: ManagerKycStore,
  ) {}

  async statusOf(subjectId: string): Promise<KycStatus> {
    const participant = await this.accounts.get(subjectId);
    if (participant) {
      return participant.kycStatus;
    }
    const manager = await this.managers.get(subjectId);
    if (manager) {
      return manager.kycStatus;
    }
    return "none";
  }

  /** Full status payload for public / internal KYC routes. */
  async getStatus(subjectId: string): Promise<PublicKycStatus> {
    const participant = await this.accounts.get(subjectId);
    if (participant) {
      return {
        subjectId,
        subjectType: "participant",
        kycStatus: participant.kycStatus,
        kycVerified: participant.kycVerified,
        method: "connect_onboarding",
        updatedAt: participant.kycVerifiedAt ?? new Date(0).toISOString(),
        payoutAccountVerified: participant.payoutAccountVerified,
      };
    }
    const manager = await this.managers.get(subjectId);
    if (manager) {
      return {
        subjectId,
        subjectType: "manager",
        kycStatus: manager.kycStatus,
        kycVerified: manager.kycVerified,
        method: "identity_document",
        updatedAt: manager.updatedAt,
        payoutAccountVerified: false,
      };
    }
    return {
      subjectId,
      subjectType: "participant",
      kycStatus: "none",
      kycVerified: false,
      method: "connect_onboarding",
      updatedAt: new Date(0).toISOString(),
      payoutAccountVerified: false,
    };
  }
}
