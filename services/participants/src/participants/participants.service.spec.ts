/**
 * INT-103 — AC-03 domain behaviour (REQ-008, REQ-009, REQ-012, REQ-050, REQ-058, BR-09).
 */
import "reflect-metadata";
import { beforeEach, describe, expect, it } from "vitest";
import {
  InMemoryOutboxStore,
  OutboxService,
} from "@intelligent/module-template";
import { ParticipantsStore } from "../domain/store.js";
import { MockIdpAdapter } from "../idp/mock-idp.adapter.js";
import { ParticipantsService } from "./participants.service.js";

describe("ParticipantsService", () => {
  let store: ParticipantsStore;
  let outboxStore: InMemoryOutboxStore;
  let idp: MockIdpAdapter;
  let service: ParticipantsService;
  let communityId: string;

  beforeEach(() => {
    store = new ParticipantsStore();
    outboxStore = new InMemoryOutboxStore();
    idp = new MockIdpAdapter();
    service = new ParticipantsService(
      store,
      new OutboxService(outboxStore),
      idp,
    );
    communityId = service.seedCommunityId();
  });

  it("imports participants, provisions IdP and emits ParticipantOnboarded (REQ-008)", async () => {
    const [created] = await service.importParticipants(communityId, [
      {
        email: "producer@example.com",
        marketActorId: "actor-prod-1",
        meterId: "meter-1",
        role: "producer",
      },
    ]);
    expect(created.status).toBe("Invited");
    expect(idp.created.size).toBe(1);
    expect(idp.invitations.size).toBe(1);
    const events = await outboxStore.list();
    expect(events.map((e) => e.event.type)).toContain("ParticipantOnboarded");
    expect(service.resolveParty("actor-prod-1")).toEqual({
      participantId: created.participantId,
      communityId,
    });
  });

  it("imports with existingIdpSubject binds Keycloak sub without creating IdP user (INT-180)", async () => {
    // Distinct from INT-194 seeded UAT subjects in seedParticipants().
    const existingSub = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    const [created] = await service.importParticipants(communityId, [
      {
        email: "linked@example.invalid",
        marketActorId: "actor-existing-1",
        meterId: "meter-existing-1",
        role: "consumer",
        existingIdpSubject: existingSub,
      },
    ]);
    expect(idp.created.size).toBe(0);
    expect(idp.invitations.size).toBe(0);
    const row = store.getParticipant(created.participantId)!;
    expect(row.idpUserId).toBe(existingSub);
    expect(service.getMe(existingSub, ["member"]).participantId).toBe(
      created.participantId,
    );
  });

  it("seeds UAT IdP subjects so getMe works without import (INT-194)", () => {
    const me = service.getMe("b7bd0605-d3e5-4015-bdb7-dd1a47bbb26f", ["member"]);
    expect(me.participantId).toBe("f69e6745-3bfe-49ad-b84e-0853aa86ad05");
    expect(me.readiness).toBe("Invited");
  });

  it("resolves community settings and rejects live mode in V1 (REQ-043)", () => {
    const settings = service.getCommunitySettings(communityId);
    expect(settings.vatRate).toBe("0.00");
    expect(settings.threshold).toBe("5.00");
    expect(() =>
      service.updateCommunitySettings(communityId, {
        ...settings,
        billingMode: "live",
      }),
    ).toThrow(/virtual/);
  });

  it("INT-274: getNotificationContact returns profile e-mail (REQ-017)", async () => {
    const [created] = await service.importParticipants(communityId, [
      {
        email: "notify@example.com",
        marketActorId: "actor-notify",
        meterId: "meter-notify",
        role: "consumer",
      },
    ]);
    const row = store.getParticipant(created.participantId)!;
    await service.updateProfile(row.idpUserId!, {
      name: "Notify Me",
      address: "1 Test",
      email: "notify@example.com",
    });
    expect(service.getNotificationContact(created.participantId)).toEqual({
      participantId: created.participantId,
      email: "notify@example.com",
    });
  });

  it("advances readiness through profile, terms and payment (BR-09, REQ-050)", async () => {
    const [created] = await service.importParticipants(communityId, [
      {
        email: "producer@example.com",
        marketActorId: "actor-prod-2",
        meterId: "meter-2",
        role: "producer",
      },
    ]);
    const row = store.getParticipant(created.participantId)!;
    expect(service.checkReadiness(created.participantId).ready).toBe(false);

    await service.updateProfile(row.idpUserId!, {
      name: "Producer One",
      address: "1 Rue Test",
      email: "producer@example.com",
    });
    expect(service.checkReadiness(created.participantId).status).toBe(
      "ProfileCompleted",
    );

    await expect(
      service.acceptTerms(row.idpUserId!, {
        termsVersion: "v1.0.0",
        selfBillingMandate: false,
      }),
    ).rejects.toThrow(/selfBillingMandate/);

    await service.acceptTerms(row.idpUserId!, {
      termsVersion: "v1.0.0",
      selfBillingMandate: true,
    });
    expect(service.checkReadiness(created.participantId).status).toBe(
      "TermsAccepted",
    );

    await service.applyPaymentAccountStatus({
      participantId: created.participantId,
      ready: true,
    });
    expect(service.checkReadiness(created.participantId)).toMatchObject({
      ready: true,
      status: "Ready",
    });

    await service.applyPaymentAccountStatus({
      participantId: created.participantId,
      ready: false,
      reason: "kyc_revoked",
    });
    expect(service.checkReadiness(created.participantId).status).toBe(
      "Restricted",
    );

    const events = await outboxStore.list();
    expect(
      events.filter((e) => e.event.type === "ParticipantReadinessChanged")
        .length,
    ).toBeGreaterThan(0);
  });

  it("patches attribution ids and offboards with ParticipantOffboarded (REQ-009, REQ-012)", async () => {
    const [created] = await service.importParticipants(communityId, [
      {
        email: "consumer@example.com",
        marketActorId: "actor-cons-1",
        meterId: "meter-c1",
        role: "consumer",
      },
    ]);
    const patched = service.patchParticipant(created.participantId, {
      marketActorId: "actor-cons-1b",
      meterId: "meter-c1b",
    });
    expect(patched.marketActorId).toBe("actor-cons-1b");
    expect(service.resolveParty("actor-cons-1b").participantId).toBe(
      created.participantId,
    );

    const off = await service.offboardParticipant(created.participantId);
    expect(off.status).toBe("Offboarded");
    expect(() => service.resolveParty("actor-cons-1b")).toThrow(/Unknown/);
    const events = await outboxStore.list();
    expect(events.map((e) => e.event.type)).toContain("ParticipantOffboarded");
  });

  it("getMe returns profile for IdP subject (REQ-049)", async () => {
    const [created] = await service.importParticipants(communityId, [
      {
        email: "member@example.com",
        marketActorId: "actor-m",
        meterId: "meter-m",
        role: "consumer",
      },
    ]);
    const row = store.getParticipant(created.participantId)!;
    await service.updateProfile(row.idpUserId!, {
      name: "Member",
      address: "Addr",
      email: "member@example.com",
    });
    const me = service.getMe(row.idpUserId!, ["member"]);
    expect(me.participantId).toBe(created.participantId);
    expect(me.profile.name).toBe("Member");
    expect(me.readiness).toBe("ProfileCompleted");
    expect(me.role).toBe("consumer");
  });

  it("getMe returns producer market role (INT-252)", async () => {
    const [created] = await service.importParticipants(communityId, [
      {
        email: "prod@example.com",
        marketActorId: "actor-p",
        meterId: "meter-p",
        role: "producer",
      },
    ]);
    const row = store.getParticipant(created.participantId)!;
    const me = service.getMe(row.idpUserId!, ["member"]);
    expect(me.role).toBe("producer");
  });

  it("rejects unknown community, duplicate import, empty import, bad profile", async () => {
    expect(() => service.getCommunitySettings("missing")).toThrow(/Unknown/);
    expect(() => service.listParticipants("missing")).toThrow(/Unknown/);
    expect(() => service.checkReadiness("missing")).toThrow(/Unknown/);
    await expect(
      service.importParticipants("missing", [
        {
          email: "a@example.com",
          marketActorId: "x",
          meterId: "m",
          role: "consumer",
        },
      ]),
    ).rejects.toThrow(/Unknown/);
    await expect(service.importParticipants(communityId, [])).rejects.toThrow(
      /empty/,
    );

    await service.importParticipants(communityId, [
      {
        email: "a@example.com",
        marketActorId: "dup",
        meterId: "m",
        role: "consumer",
      },
    ]);
    await expect(
      service.importParticipants(communityId, [
        {
          email: "b@example.com",
          marketActorId: "dup",
          meterId: "m2",
          role: "consumer",
        },
      ]),
    ).rejects.toThrow(/already registered/);

    const [created] = await service.importParticipants(communityId, [
      {
        email: "c@example.com",
        marketActorId: "actor-c",
        meterId: "mc",
        role: "consumer",
      },
    ]);
    const row = store.getParticipant(created.participantId)!;
    await expect(
      service.updateProfile(row.idpUserId!, {
        name: "",
        address: "x",
        email: "c@example.com",
      }),
    ).rejects.toThrow(/required/);
    await expect(
      service.acceptTerms(row.idpUserId!, {
        termsVersion: "wrong",
        selfBillingMandate: false,
      }),
    ).rejects.toThrow(/termsVersion/);

    const off = await service.offboardParticipant(created.participantId);
    expect(off.status).toBe("Offboarded");
    const again = await service.offboardParticipant(created.participantId);
    expect(again.status).toBe("Offboarded");
    expect(() =>
      service.patchParticipant(created.participantId, { meterId: "z" }),
    ).toThrow(/offboarded/);
  });

  it("INT-230 — resolves IdP sub to participantId", () => {
    const row = service.resolveByIdpSub("b7bd0605-d3e5-4015-bdb7-dd1a47bbb26f");
    expect(row.participantId).toBe("f69e6745-3bfe-49ad-b84e-0853aa86ad05");
    expect(() =>
      service.resolveByIdpSub("00000000-0000-4000-8000-000000000099"),
    ).toThrow(/Unknown IdP/);
  });

  it("INT-230 — S1 producers reach Ready after payment-account notify", async () => {
    const producerId = "66666666-7777-4888-9999-aaaaaaaaaaaa";
    expect(service.checkReadiness(producerId).ready).toBe(false);
    await service.applyPaymentAccountStatus({
      participantId: producerId,
      ready: true,
    });
    expect(service.checkReadiness(producerId)).toMatchObject({
      ready: true,
      status: "Ready",
    });
  });

  it("updates community settings when virtual (REQ-006)", () => {
    const current = service.getCommunitySettings(communityId);
    const next = service.updateCommunitySettings(communityId, {
      ...current,
      threshold: "7.50",
      currency: "CHF",
    });
    expect(next.threshold).toBe("7.50");
    expect(next.currency).toBe("CHF");
  });
});
