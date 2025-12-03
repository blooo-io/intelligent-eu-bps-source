import "reflect-metadata";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { NestFactory } from "@nestjs/core";
import type { INestApplication } from "@nestjs/common";
import { AppModule } from "./app.module.js";
import { SchedulerService } from "./scheduler/scheduler.service.js";

const COMMUNITY = "c0ffee00-1234-4abc-8def-0123456789ab";
const START_RUN_ID = "a1000000-0000-4000-8000-000000000003";

describe("scheduler HTTP (INT-113)", () => {
  let app: INestApplication;
  let base: string;
  let service: SchedulerService;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address();
    if (address === null || typeof address === "string") {
      throw new Error("expected TCP address");
    }
    base = `http://127.0.0.1:${address.port}`;
    service = app.get(SchedulerService);
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
    expect(await res.json()).toEqual({ status: "ok", module: "scheduler" });
  });

  it("operator lists jobs and runs StartRun (REQ-006)", async () => {
    const denied = await fetch(`${base}/v1/jobs`);
    expect(denied.status).toBe(401);

    const listed = await fetch(`${base}/v1/jobs`, {
      headers: { "x-intelligent-roles": "operator" },
    });
    expect(listed.status).toBe(200);
    const jobs = (await listed.json()) as Array<{ name: string }>;
    expect(jobs.some((j) => j.name === "StartRun")).toBe(true);

    const run = await fetch(
      `${base}/v1/jobs/${START_RUN_ID}:run?period=2026-09`,
      {
        method: "POST",
        headers: {
          "x-intelligent-roles": "manager",
          "x-intelligent-community": COMMUNITY,
        },
      },
    );
    expect(run.status).toBe(202);
    expect(await run.json()).toMatchObject({
      jobId: START_RUN_ID,
      name: "StartRun",
      outcome: "succeeded",
      communityId: COMMUNITY,
    });
    expect(service.recordedDispatches()[0]?.body).toMatchObject({
      type: "periodic",
      period: "2026-09",
      communityId: COMMUNITY,
    });
  });
});
