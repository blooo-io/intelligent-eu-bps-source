/**
 * INT-103 — HTTP surface for internal + public AC-03 paths.
 */
import "reflect-metadata";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { NestFactory } from "@nestjs/core";
import type { INestApplication } from "@nestjs/common";
import { AppModule } from "./app.module.js";
import { ParticipantsStore } from "./domain/store.js";
import { ParticipantsService } from "./participants/participants.service.js";
import { SEED_COMMUNITY_ID } from "./domain/seed.js";

describe("participants HTTP (INT-103)", () => {
  let app: INestApplication;
  let base: string;
  let service: ParticipantsService;
  let store: ParticipantsStore;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address();
    if (address === null || typeof address === "string") {
      throw new Error("expected TCP address");
    }
    base = `http://127.0.0.1:${address.port}`;
    service = app.get(ParticipantsService);
    store = app.get(ParticipantsStore);
  });

  beforeEach(() => {
    service.resetStore();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /health is open for probes", async () => {
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", module: "participants" });
  });

  it("internal ResolveParty / settings / readiness require service principal", async () => {
    const denied = await fetch(`${base}/internal/v1/parties:resolve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ marketId: "x" }),
    });
    expect(denied.status).toBe(401);

    const imported = await service.importParticipants(SEED_COMMUNITY_ID, [
      {
        email: "p@example.com",
        marketActorId: "mkt-http-1",
        meterId: "m1",
        role: "producer",
      },
    ]);

    const resolve = await fetch(`${base}/internal/v1/parties:resolve`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-intelligent-roles": "service",
      },
      body: JSON.stringify({ marketId: "mkt-http-1" }),
    });
    expect(resolve.status).toBe(200);
    expect(await resolve.json()).toEqual({
      participantId: imported[0].participantId,
      communityId: SEED_COMMUNITY_ID,
    });

    const settings = await fetch(
      `${base}/internal/v1/communities/${SEED_COMMUNITY_ID}/settings`,
      { headers: { "x-intelligent-roles": "service" } },
    );
    expect(settings.status).toBe(200);
    const body = (await settings.json()) as { billingMode: string };
    expect(body.billingMode).toBe("virtual");

    const readiness = await fetch(
      `${base}/internal/v1/participants/${imported[0].participantId}/readiness`,
      { headers: { "x-intelligent-roles": "service" } },
    );
    expect(readiness.status).toBe(200);
    expect(await readiness.json()).toMatchObject({
      ready: false,
      status: "Invited",
    });

    // INT-230 — IdP sub resolve (seeded UAT member).
    const byIdp = await fetch(
      `${base}/internal/v1/participants:by-idp-sub/b7bd0605-d3e5-4015-bdb7-dd1a47bbb26f`,
      { headers: { "x-intelligent-roles": "service" } },
    );
    expect(byIdp.status).toBe(200);
    expect(await byIdp.json()).toMatchObject({
      participantId: "f69e6745-3bfe-49ad-b84e-0853aa86ad05",
      communityId: SEED_COMMUNITY_ID,
    });
  });

  it("manager import + list participants (REQ-008)", async () => {
    const res = await fetch(
      `${base}/v1/communities/${SEED_COMMUNITY_ID}/participants:import`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-intelligent-roles": "manager",
          "x-intelligent-community": SEED_COMMUNITY_ID,
          "x-intelligent-token-use": "user",
          "x-intelligent-sub": "manager-1",
        },
        body: JSON.stringify({
          participants: [
            {
              email: "c@example.com",
              marketActorId: "mkt-http-2",
              meterId: "m2",
              role: "consumer",
            },
          ],
        }),
      },
    );
    expect(res.status).toBe(201);
    const created = (await res.json()) as Array<{ participantId: string }>;
    expect(created).toHaveLength(1);

    const list = await fetch(
      `${base}/v1/communities/${SEED_COMMUNITY_ID}/participants`,
      {
        headers: {
          "x-intelligent-roles": "manager",
          "x-intelligent-community": SEED_COMMUNITY_ID,
          "x-intelligent-token-use": "user",
        },
      },
    );
    expect(list.status).toBe(200);
    // INT-194 seeds 3 UAT participants; import adds one more.
    expect(await list.json()).toHaveLength(4);
  });

  it("manager import with existingIdpSubject then GET /v1/me (INT-180)", async () => {
    const existingSub = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    const res = await fetch(
      `${base}/v1/communities/${SEED_COMMUNITY_ID}/participants:import`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-intelligent-roles": "manager",
          "x-intelligent-community": SEED_COMMUNITY_ID,
          "x-intelligent-token-use": "user",
          "x-intelligent-sub": "manager-1",
        },
        body: JSON.stringify({
          participants: [
            {
              email: "linked@example.com",
              marketActorId: "mkt-linked-1",
              meterId: "m-linked",
              role: "consumer",
              existingIdpSubject: existingSub,
            },
          ],
        }),
      },
    );
    expect(res.status).toBe(201);
    const me = await fetch(`${base}/v1/me`, {
      headers: {
        "x-intelligent-roles": "member",
        "x-intelligent-token-use": "user",
        "x-intelligent-sub": existingSub,
        "x-intelligent-community": SEED_COMMUNITY_ID,
      },
    });
    expect(me.status).toBe(200);
    const body = (await me.json()) as { participantId: string };
    expect(body.participantId).toBeTruthy();
  });

  it("GET /v1/terms/current returns current terms (REQ-050)", async () => {
    const res = await fetch(`${base}/v1/terms/current`, {
      headers: {
        "x-intelligent-roles": "member",
        "x-intelligent-community": SEED_COMMUNITY_ID,
        "x-intelligent-token-use": "user",
        "x-intelligent-sub": "anyone",
      },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ termsVersion: "v1.0.0" });
  });

  it("member profile, terms, me; manager settings, patch, offboard", async () => {
    const [created] = await service.importParticipants(SEED_COMMUNITY_ID, [
      {
        email: "member@example.com",
        marketActorId: "mkt-http-3",
        meterId: "m3",
        role: "consumer",
      },
    ]);
    const sub = store.getParticipant(created.participantId)!.idpUserId!;

    const meDenied = await fetch(`${base}/v1/me`, {
      headers: {
        "x-intelligent-roles": "member",
        "x-intelligent-token-use": "user",
        "x-intelligent-sub": "unknown-sub",
        "x-intelligent-community": SEED_COMMUNITY_ID,
      },
    });
    expect(meDenied.status).toBe(404);

    const profile = await fetch(`${base}/v1/me/profile`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "x-intelligent-roles": "member",
        "x-intelligent-token-use": "user",
        "x-intelligent-sub": sub,
        "x-intelligent-community": SEED_COMMUNITY_ID,
      },
      body: JSON.stringify({
        name: "Member",
        address: "1 Test St",
        email: "member@example.com",
      }),
    });
    expect(profile.status).toBe(200);

    const terms = await fetch(`${base}/v1/me/terms-acceptance`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-intelligent-roles": "member",
        "x-intelligent-token-use": "user",
        "x-intelligent-sub": sub,
        "x-intelligent-community": SEED_COMMUNITY_ID,
      },
      body: JSON.stringify({
        termsVersion: "v1.0.0",
        selfBillingMandate: false,
      }),
    });
    expect(terms.status).toBe(201);

    const me = await fetch(`${base}/v1/me`, {
      headers: {
        "x-intelligent-roles": "member",
        "x-intelligent-token-use": "user",
        "x-intelligent-sub": sub,
        "x-intelligent-community": SEED_COMMUNITY_ID,
      },
    });
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({
      participantId: created.participantId,
      readiness: "TermsAccepted",
    });

    const settingsGet = await fetch(
      `${base}/v1/communities/${SEED_COMMUNITY_ID}/settings`,
      {
        headers: {
          "x-intelligent-roles": "manager",
          "x-intelligent-community": SEED_COMMUNITY_ID,
          "x-intelligent-token-use": "user",
        },
      },
    );
    expect(settingsGet.status).toBe(200);
    const settings = (await settingsGet.json()) as {
      currency: string;
      billingPeriod: string;
      threshold: string;
      vatRate: string;
      billingMode: string;
    };

    const settingsPut = await fetch(
      `${base}/v1/communities/${SEED_COMMUNITY_ID}/settings`,
      {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "x-intelligent-roles": "manager",
          "x-intelligent-community": SEED_COMMUNITY_ID,
          "x-intelligent-token-use": "user",
        },
        body: JSON.stringify({
          ...settings,
          threshold: "10.00",
        }),
      },
    );
    expect(settingsPut.status).toBe(200);
    expect(await settingsPut.json()).toMatchObject({ threshold: "10.00" });

    const patched = await fetch(
      `${base}/v1/participants/${created.participantId}`,
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-intelligent-roles": "manager",
          "x-intelligent-community": SEED_COMMUNITY_ID,
          "x-intelligent-token-use": "user",
        },
        body: JSON.stringify({ meterId: "m3-b" }),
      },
    );
    expect(patched.status).toBe(200);
    expect(await patched.json()).toMatchObject({ meterId: "m3-b" });

    const foreign = await fetch(
      `${base}/v1/participants/00000000-0000-4000-8000-000000000099`,
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-intelligent-roles": "manager",
          "x-intelligent-community": SEED_COMMUNITY_ID,
          "x-intelligent-token-use": "user",
        },
        body: JSON.stringify({ meterId: "x" }),
      },
    );
    expect(foreign.status).toBe(404);

    const off = await fetch(
      `${base}/v1/participants/${created.participantId}:offboard`,
      {
        method: "POST",
        headers: {
          "x-intelligent-roles": "manager",
          "x-intelligent-community": SEED_COMMUNITY_ID,
          "x-intelligent-token-use": "user",
        },
      },
    );
    expect(off.status).toBe(202);
    expect(await off.json()).toMatchObject({ status: "Offboarded" });
  });
});
