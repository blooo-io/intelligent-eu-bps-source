import "reflect-metadata";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { NestFactory } from "@nestjs/core";
import type { INestApplication } from "@nestjs/common";
import { AppModule } from "./app.module.js";
import { PublicationService } from "./publication/publication.service.js";

describe("publication HTTP (INT-109)", () => {
  let app: INestApplication;
  let base: string;
  let service: PublicationService;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address();
    if (address === null || typeof address === "string") {
      throw new Error("expected TCP address");
    }
    base = `http://127.0.0.1:${address.port}`;
    service = app.get(PublicationService);
  });

  beforeEach(() => {
    service.resetStore();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /health is open", async () => {
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", module: "publication" });
  });

  it("retry-pending and purge-cache require service principal (REQ-048, REQ-053)", async () => {
    const denied = await fetch(`${base}/internal/v1/publication:retry-pending`, {
      method: "POST",
    });
    expect(denied.status).toBe(401);

    const retry = await fetch(`${base}/internal/v1/publication:retry-pending`, {
      method: "POST",
      headers: { "x-intelligent-roles": "service" },
    });
    expect(retry.status).toBe(202);
    expect(await retry.json()).toMatchObject({ accepted: true });

    const purgeDenied = await fetch(
      `${base}/internal/v1/publication:purge-cache`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ before: new Date().toISOString() }),
      },
    );
    expect(purgeDenied.status).toBe(401);

    const purge = await fetch(`${base}/internal/v1/publication:purge-cache`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-intelligent-roles": "service",
      },
      body: JSON.stringify({ before: new Date().toISOString() }),
    });
    expect(purge.status).toBe(202);
    expect(await purge.json()).toMatchObject({ accepted: true });
  });
});
