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
    const body = (await settings.json()) as { billingMode: string; autoPayout: boolean };
    expect(body.billingMode).toBe("virtual");
    expect(body.autoPayout).toBe(false);

    const readiness = await fetch(
      `${base}/internal/v1/participants/${imported[0].participantId}/readiness`,
      { headers: { "x-intelligent-roles": "service" } },
    );
    expect(readiness.status).toBe(200);
    expect(await readiness.json()).toMatchObject({
      ready: false,
      status: "Invited",
    });

    const community = await fetch(
      `${base}/internal/v1/participants/${imported[0].participantId}/community`,
      { headers: { "x-intelligent-roles": "service" } },
    );
    expect(community.status).toBe(200);
    expect(await community.json()).toEqual({
      participantId: imported[0].participantId,
      communityId: SEED_COMMUNITY_ID,
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

    // INT-440 / Task 2.9 — invoice-party for AC-06 PDF (S1 producer A).
    const party = await fetch(
      `${base}/internal/v1/participants/66666666-7777-4888-9999-aaaaaaaaaaaa/invoice-party`,
      { headers: { "x-intelligent-roles": "service" } },
    );
    expect(party.status).toBe(200);
    expect(await party.json()).toMatchObject({
      name: "Thomas Bernard",
      address: "1 Fixture Lane",
      selfBillingMandate: { termsVersion: "v1.0.0", acceptedAt: null },
    });

    // REQ-061 — manager-contact 404 until settings write.
    const unset = await fetch(
      `${base}/internal/v1/communities/${SEED_COMMUNITY_ID}/manager-contact`,
      { headers: { "x-intelligent-roles": "service" } },
    );
    expect(unset.status).toBe(404);
  });
});
