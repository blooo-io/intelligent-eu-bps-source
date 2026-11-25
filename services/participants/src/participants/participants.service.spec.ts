/**
 * INT-103 — AC-03 domain behaviour (REQ-008, REQ-009, REQ-012, REQ-050, REQ-058, BR-09).
 */
import "reflect-metadata";
import {
  ConflictException,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  InMemoryOutboxStore,
  OutboxService,
} from "@intelligent/module-template";
import { ParticipantsStore } from "../domain/store.js";
import type { ParticipantRecord } from "../domain/types.js";
import { MockIdpAdapter } from "../idp/mock-idp.adapter.js";
import type { PspCapabilitiesPort } from "../ports/psp-capabilities.port.js";
import { ParticipantsService } from "./participants.service.js";
import {
  S1_COMMUNITY_ID,
  S1_CONSUMER_ID,
} from "../domain/seed.js";

describe("ParticipantsService", () => {
  let store: ParticipantsStore;
  let outboxStore: InMemoryOutboxStore;
  let idp: MockIdpAdapter;
  let service: ParticipantsService;
  let communityId: string;
  let pspCapabilities: PspCapabilitiesPort & { liveConfigured: boolean };

  beforeEach(() => {
    store = new ParticipantsStore();
    outboxStore = new InMemoryOutboxStore();
    idp = new MockIdpAdapter();
    pspCapabilities = {
      liveConfigured: false,
      async get() {
        return {
          provider: "mock" as const,
          testConfigured: true,
          liveConfigured: pspCapabilities.liveConfigured,
        };
      },
    };
    service = new ParticipantsService(
      store,
      new OutboxService(outboxStore),
      idp,
      pspCapabilities,
      { async list(communityId: string) { return { communityId, periods: [] as string[] }; } },
    );
    communityId = service.seedCommunityId();
  });

  it("lists directory name and email for managers (INT-283 / REQ-008)", () => {
    const listed = service.listParticipants(S1_COMMUNITY_ID);
    const lea = listed.find((r) => r.participantId === S1_CONSUMER_ID);
    expect(lea?.name).toBe("Léa Martin");
    expect(lea?.email).toBe("lea.martin@example.invalid");
    expect(lea?.meterId).toBe("m-lea-martin");
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

  it("REQ-043: manager cannot switch to live (403)", async () => {
    const settings = service.getCommunitySettings(communityId);
    expect(settings.billingMode).toBe("virtual");
    await expect(
      service.updateCommunitySettings(
        communityId,
        { ...settings, billingMode: "live" },
        ["manager"],
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("REQ-043: operator switch to live refused without live keys (409 live_keys_missing)", async () => {
    const settings = service.getCommunitySettings(communityId);
    pspCapabilities.liveConfigured = false;
    await expect(
      service.updateCommunitySettings(
        communityId,
        { ...settings, billingMode: "live" },
        ["operator"],
      ),
    ).rejects.toMatchObject({
      response: { code: "live_keys_missing" },
    });
    await expect(
      service.updateCommunitySettings(
        communityId,
        { ...settings, billingMode: "live" },
        ["operator"],
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("REQ-043: operator switches Greenvolt to live when live keys configured", async () => {
    const settings = service.getCommunitySettings(communityId);
    pspCapabilities.liveConfigured = true;
    const next = await service.updateCommunitySettings(
      communityId,
      { ...settings, billingMode: "live" },
      ["operator"],
    );
    expect(next.billingMode).toBe("live");
    expect(service.getCommunitySettings(communityId).billingMode).toBe("live");
    const events = await outboxStore.list();
    expect(
      events.some(
        (e) =>
          e.event.type === "AuditableActionPerformed" &&
          (e.event.data as { action?: string }).action ===
            "community.billing-mode.live",
      ),
    ).toBe(true);
  });

  it("REQ-043: switch to live refused while settlement has an unbilled or open period", async () => {
    const settings = service.getCommunitySettings(communityId);
    pspCapabilities.liveConfigured = true;
    // Rebuild with a stub that reports an open period (Task 3.14).
    service = new ParticipantsService(
      store,
      new OutboxService(outboxStore),
      idp,
      pspCapabilities,
      {
        async list(id: string) {
          return { communityId: id, periods: ["2026-11"] };
        },
      },
    );
    await expect(
      service.updateCommunitySettings(
        communityId,
        { ...settings, billingMode: "live" },
        ["operator"],
      ),
    ).rejects.toMatchObject({
      response: { code: "open_period", periods: ["2026-11"] },
    });
  });

  it("REQ-043: live to virtual is refused (409)", async () => {
    const settings = service.getCommunitySettings(communityId);
    pspCapabilities.liveConfigured = true;
    await service.updateCommunitySettings(
      communityId,
      { ...settings, billingMode: "live" },
      ["operator"],
    );
    await expect(
      service.updateCommunitySettings(
        communityId,
        { ...settings, billingMode: "virtual" },
        ["operator"],
      ),
    ).rejects.toMatchObject({
      response: { code: "live_to_virtual_refused" },
    });
  });

  it("REQ-043 / UAT-054: manager edits threshold of a virtual community unchanged", async () => {
    const settings = service.getCommunitySettings(communityId);
    expect(settings.billingMode).toBe("virtual");
    const next = await service.updateCommunitySettings(
      communityId,
      { ...settings, threshold: "9.00" },
      ["manager"],
    );
    expect(next.threshold).toBe("9.00");
    expect(next.billingMode).toBe("virtual");
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
      service.acceptTerms(row.idpUserId!, ["member"], {
        termsVersion: "v1.0.0",
        selfBillingMandate: false,
      }),
    ).rejects.toThrow(/selfBillingMandate/);

    await service.acceptTerms(row.idpUserId!, ["member"], {
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
    // REQ-045 — payment without KYC stays TermsAccepted.
    expect(service.checkReadiness(created.participantId)).toMatchObject({
      ready: false,
      status: "TermsAccepted",
      reason: "kyc_not_verified",
      kycVerified: false,
    });

    await service.applyKycStatus({
      eventId: "evt-ready-1",
      participantId: created.participantId,
      kycVerified: true,
    });
    expect(service.checkReadiness(created.participantId)).toMatchObject({
      ready: true,
      status: "Ready",
      kycVerified: true,
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
      service.acceptTerms(row.idpUserId!, ["member"], {
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
    // REQ-045 — S1 seeds have kycVerified:true so payment alone → Ready.
    expect(service.checkReadiness(producerId).kycVerified).toBe(true);
    await service.applyPaymentAccountStatus({
      participantId: producerId,
      ready: true,
    });
    expect(service.checkReadiness(producerId)).toMatchObject({
      ready: true,
      status: "Ready",
      kycVerified: true,
    });
  });

  it("REQ-045: checkReadiness reason kyc_not_verified", async () => {
    const [created] = await service.importParticipants(communityId, [
      {
        email: "nokyc@example.com",
        marketActorId: "actor-nokyc",
        meterId: "meter-nokyc",
        role: "consumer",
      },
    ]);
    const row = store.getParticipant(created.participantId)!;
    await service.updateProfile(row.idpUserId!, {
      name: "No Kyc",
      address: "1 Gate",
      email: "nokyc@example.com",
    });
    await service.acceptTerms(row.idpUserId!, ["member"], {
      termsVersion: "v1.0.0",
      selfBillingMandate: false,
    });
    await service.applyPaymentAccountStatus({
      participantId: created.participantId,
      ready: true,
    });
    expect(service.checkReadiness(created.participantId)).toMatchObject({
      ready: false,
      status: "TermsAccepted",
      reason: "kyc_not_verified",
      kycVerified: false,
    });
  });

  it("REQ-050 / UAT-062: acceptance records version and timestamp", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-25T09:00:00Z"));
    try {
      const [created] = await service.importParticipants(communityId, [
        {
          email: "terms@example.com",
          marketActorId: "actor-terms-ts",
          meterId: "meter-terms-ts",
          role: "consumer",
        },
      ]);
      const row = store.getParticipant(created.participantId)!;
      await service.updateProfile(row.idpUserId!, {
        name: "Terms User",
        address: "1 Terms",
        email: "terms@example.com",
      });
      const accepted = await service.acceptTerms(row.idpUserId!, ["member"], {
        termsVersion: "v1.0.0",
        selfBillingMandate: false,
      });
      expect(accepted.acceptedAt).toBe("2026-11-25T09:00:00.000Z");
      expect(service.getMe(row.idpUserId!, ["member"]).termsAcceptedAt).toBe(
        "2026-11-25T09:00:00.000Z",
      );
      const events = await outboxStore.list();
      expect(
        events.some(
          (e) =>
            e.event.type === "AuditableActionPerformed" &&
            (e.event.data as { action?: string }).action === "terms.accepted",
        ),
      ).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("REQ-050: producer without self-billing mandate is refused", async () => {
    const [created] = await service.importParticipants(communityId, [
      {
        email: "prod-mandate@example.com",
        marketActorId: "actor-mandate",
        meterId: "meter-mandate",
        role: "producer",
      },
    ]);
    const row = store.getParticipant(created.participantId)!;
    await expect(
      service.acceptTerms(row.idpUserId!, ["member"], {
        termsVersion: "v1.0.0",
        selfBillingMandate: false,
      }),
    ).rejects.toThrow(/selfBillingMandate/);
  });

  it("REQ-050: consumer may accept with selfBillingMandate false", async () => {
    const [created] = await service.importParticipants(communityId, [
      {
        email: "cons-ok@example.com",
        marketActorId: "actor-cons-ok",
        meterId: "meter-cons-ok",
        role: "consumer",
      },
    ]);
    const row = store.getParticipant(created.participantId)!;
    const result = await service.acceptTerms(row.idpUserId!, ["member"], {
      termsVersion: "v1.0.0",
      selfBillingMandate: false,
    });
    expect(result.selfBillingMandate).toBe(false);
    expect(store.getParticipant(created.participantId)?.termsVersionAccepted).toBe(
      "v1.0.0",
    );
  });

  it("REQ-050: community manager acceptance is recorded as ManagerConsent", async () => {
    const managerSub = "cccccccc-dddd-4eee-8fff-000000000001";
    const accepted = await service.acceptTerms(
      managerSub,
      ["manager"],
      { termsVersion: "v1.0.0", selfBillingMandate: false },
      communityId,
    );
    expect(accepted.termsVersion).toBe("v1.0.0");
    expect(store.getManagerConsent(communityId, managerSub)).toMatchObject({
      subjectId: managerSub,
      communityId,
      termsVersion: "v1.0.0",
      acceptedAt: accepted.acceptedAt,
    });
  });

  it("updates community settings when virtual (REQ-006)", async () => {
    const current = service.getCommunitySettings(communityId);
    const next = await service.updateCommunitySettings(
      communityId,
      {
        ...current,
        threshold: "7.50",
        currency: "CHF",
      },
      ["manager"],
    );
    expect(next.threshold).toBe("7.50");
    expect(next.currency).toBe("CHF");
  });

  it("REQ-015: autoPayout defaults to false and round-trips", async () => {
    const current = service.getCommunitySettings(communityId);
    expect(current.autoPayout).toBe(false);
    const enabled = await service.updateCommunitySettings(
      communityId,
      {
        ...current,
        autoPayout: true,
      },
      ["manager"],
    );
    expect(enabled.autoPayout).toBe(true);
    expect(service.getCommunitySettings(communityId).autoPayout).toBe(true);
    const { autoPayout: _omitted, ...withoutAutoPayout } = enabled;
    const reset = await service.updateCommunitySettings(
      communityId,
      withoutAutoPayout,
      ["manager"],
    );
    expect(reset.autoPayout).toBe(false);
  });

  it("B2 / REQ-004: tariffBilling defaults to false and round-trips", async () => {
    const current = service.getCommunitySettings(communityId);
    expect(current.tariffBilling).toBe(false);
    const enabled = await service.updateCommunitySettings(
      communityId,
      { ...current, tariffBilling: true },
      ["manager"],
    );
    expect(enabled.tariffBilling).toBe(true);
    const { tariffBilling: _omitted, ...without } = enabled;
    const reset = await service.updateCommunitySettings(
      communityId,
      without,
      ["manager"],
    );
    expect(reset.tariffBilling).toBe(false);
  });

  it("REQ-013 / INT-275 — erasure anonymizes profile and emits ErasureCompleted", async () => {
    const participantId = "f69e6745-3bfe-49ad-b84e-0853aa86ad05";
    const before = store.getParticipant(participantId)!;
    expect(before.profile?.email).toContain("@");
    const idpBefore = before.idpUserId!;

    const result = await service.applyErasureRequested({
      requestId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      participantId,
    });
    expect(result.result).toBe("completed");

    const after = store.getParticipant(participantId)!;
    expect(after.profile?.email).toBe("[erased]");
    expect(after.idpUserId).toBeNull();
    // Task 3.18 — IdP delete is eraseIdentity, not the local anonymization path.
    expect(idp.deleted.has(idpBefore)).toBe(false);

    const events = await outboxStore.list();
    const completed = events.find((e) => e.event.type === "ErasureCompleted");
    expect(completed?.event.producer).toBe("AC-03");
    expect(completed?.event.data).toEqual({
      requestId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      module: "AC-03",
      result: "completed",
    });
    expect(JSON.stringify(events)).not.toMatch(/@/);
  });

  it("REQ-013: personal-data returns profile, address, contact, consents", () => {
    const participantId = "aaaaaaaa-1111-4111-8111-111111111111";
    const fixture: ParticipantRecord = {
      participantId,
      communityId: S1_COMMUNITY_ID,
      role: "consumer",
      status: "TermsAccepted",
      marketActorId: "mkt-ewds-lisboa",
      meterId: "m-lisboa-1",
      idpUserId: "bbbbbbbb-2222-4222-8222-222222222222",
      profile: {
        name: "Ana Silva",
        address: "Rua Augusta 1, 1100-053 Lisboa, PT",
        email: "ana.silva@example.invalid",
      },
      termsVersionAccepted: "v1.0.0",
      selfBillingMandate: false,
      paymentAccountReady: true,
      paymentBlockReason: null,
      source: "ewds",
      postalAddress: {
        street: "Rua Augusta 1",
        postalCode: "1100-053",
        city: "Lisboa",
        country: "PT",
      },
      phone: "+351910000000",
      termsAcceptedAt: "2026-11-20T12:00:00.000Z",
      kycVerified: true,
      actorVersion: "1",
    };
    store.putParticipant(fixture);

    const data = service.getPersonalData(participantId);
    expect(data).toEqual({
      participantId,
      communityId: S1_COMMUNITY_ID,
      role: "consumer",
      source: "ewds",
      marketActorId: "mkt-ewds-lisboa",
      meterId: "m-lisboa-1",
      profile: {
        name: "Ana Silva",
        address: "Rua Augusta 1, 1100-053 Lisboa, PT",
        email: "ana.silva@example.invalid",
      },
      postalAddress: {
        street: "Rua Augusta 1",
        postalCode: "1100-053",
        city: "Lisboa",
        country: "PT",
      },
      phone: "+351910000000",
      idpUserId: "bbbbbbbb-2222-4222-8222-222222222222",
      consents: {
        termsVersion: "v1.0.0",
        termsAcceptedAt: "2026-11-20T12:00:00.000Z",
        selfBillingMandate: false,
      },
      readiness: "Ready",
      kycVerified: true,
    });
  });

  it("REQ-013: eraseIdentity deletes the Keycloak user, 404 counts as erased", async () => {
    const [created] = await service.importParticipants(communityId, [
      {
        email: "erase-me@example.invalid",
        marketActorId: "mkt-erase-1",
        meterId: "m-erase-1",
        role: "consumer",
      },
    ]);
    const idpUserId = store.getParticipant(created.participantId)!.idpUserId!;
    expect(idp.created.has(idpUserId)).toBe(true);

    const first = await service.eraseIdentity(created.participantId);
    expect(first.erased).toBe(true);
    expect(idp.deleted.has(idpUserId)).toBe(true);

    // Simulate Keycloak 404 for an already-deleted user.
    idp.deleteUser = vi.fn(async () => {
      throw Object.assign(new Error("Keycloak deleteUser failed with HTTP 404"), {
        status: 404,
      });
    });
    const second = await service.eraseIdentity(created.participantId);
    expect(second.erased).toBe(true);
  });

  it("REQ-013: personal-data payload is never logged", () => {
    const participantId = "f69e6745-3bfe-49ad-b84e-0853aa86ad05";
    const email = store.getParticipant(participantId)!.profile!.email;
    const logSpy = vi.spyOn(Logger.prototype, "log");
    const warnSpy = vi.spyOn(Logger.prototype, "warn");
    const errorSpy = vi.spyOn(Logger.prototype, "error");

    service.getPersonalData(participantId);

    const joined = [...logSpy.mock.calls, ...warnSpy.mock.calls, ...errorSpy.mock.calls]
      .flat()
      .map(String)
      .join(" ");
    expect(joined).not.toContain(email);
    expect(joined).toContain(participantId);
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
