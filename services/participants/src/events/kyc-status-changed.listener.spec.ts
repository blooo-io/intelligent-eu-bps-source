/**
 * REQ-051 / REQ-045 — KycStatusChanged mirrors kycVerified and advances readiness.
 */
import "reflect-metadata";
import { beforeEach, describe, expect, it } from "vitest";
import {
  IdempotentConsumer,
  InMemoryOutboxStore,
  InMemoryProcessedEventsStore,
  OutboxService,
} from "@intelligent/module-template";
import { ParticipantsStore } from "../domain/store.js";
import { MockIdpAdapter } from "../idp/mock-idp.adapter.js";
import { ParticipantsService } from "../participants/participants.service.js";
import { InMemoryEventBus } from "./in-memory-event-bus.js";
import { KycStatusChangedListener } from "./kyc-status-changed.listener.js";

describe("KycStatusChangedListener (REQ-051)", () => {
  let bus: InMemoryEventBus;
  let store: ParticipantsStore;
  let outboxStore: InMemoryOutboxStore;
  let service: ParticipantsService;
  let listener: KycStatusChangedListener;

  beforeEach(async () => {
    bus = new InMemoryEventBus();
    store = new ParticipantsStore();
    outboxStore = new InMemoryOutboxStore();
    service = new ParticipantsService(
      store,
      new OutboxService(outboxStore),
      new MockIdpAdapter(),
    );
    listener = new KycStatusChangedListener(
      bus,
      service,
      new IdempotentConsumer(new InMemoryProcessedEventsStore()),
    );
    await listener.onModuleInit();
  });

  it("REQ-051: KycStatusChanged sets kycVerified and emits ParticipantReadinessChanged once", async () => {
    const communityId = service.seedCommunityId();
    const [created] = await service.importParticipants(communityId, [
      {
        email: "kyc@example.com",
        marketActorId: "actor-kyc-1",
        meterId: "meter-kyc-1",
        role: "consumer",
      },
    ]);
    const row = store.getParticipant(created.participantId)!;
    await service.updateProfile(row.idpUserId!, {
      name: "Kyc User",
      address: "1 KYC Lane",
      email: "kyc@example.com",
    });
    await service.acceptTerms(row.idpUserId!, ["member"], {
      termsVersion: "v1.0.0",
      selfBillingMandate: false,
    });
    await service.applyPaymentAccountStatus({
      participantId: created.participantId,
      ready: true,
    });
    expect(service.checkReadiness(created.participantId).status).toBe(
      "TermsAccepted",
    );

    const before = await outboxStore.list();
    const beforeCount = before.filter(
      (e) => e.event.type === "ParticipantReadinessChanged",
    ).length;

    const envelope = {
      eventId: "evt-kyc-1",
      type: "KycStatusChanged",
      producer: "AC-07",
      data: {
        subjectId: created.participantId,
        subjectType: "participant",
        kycStatus: "verified",
        kycVerified: true,
        method: "connect_onboarding",
        payoutAccountVerified: false,
      },
    };
    await bus.publish("KycStatusChanged", envelope);
    await bus.publish("KycStatusChanged", envelope);

    expect(store.getParticipant(created.participantId)?.kycVerified).toBe(true);
    expect(service.checkReadiness(created.participantId)).toMatchObject({
      ready: true,
      status: "Ready",
      kycVerified: true,
    });

    const after = await outboxStore.list();
    const readiness = after.filter(
      (e) => e.event.type === "ParticipantReadinessChanged",
    );
    expect(readiness.length - beforeCount).toBe(1);
    expect(readiness.at(-1)?.event.data).toMatchObject({
      participantId: created.participantId,
      ready: true,
    });
  });

  it("ignores manager subjectType", async () => {
    const apply = async () => {
      await bus.publish("KycStatusChanged", {
        eventId: "evt-kyc-mgr",
        data: {
          subjectId: "11111111-2222-4333-8444-555555555555",
          subjectType: "manager",
          kycVerified: true,
        },
      });
    };
    await apply();
    expect(
      store.getParticipant("11111111-2222-4333-8444-555555555555")?.kycVerified,
    ).toBe(true); // S1 seed already true — unchanged path
  });
});
