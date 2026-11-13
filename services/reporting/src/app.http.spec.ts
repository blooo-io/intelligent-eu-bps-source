import "reflect-metadata";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { NestFactory } from "@nestjs/core";
import type { INestApplication } from "@nestjs/common";
import { AppModule } from "./app.module.js";
import { ReportingService } from "./reporting/reporting.service.js";
import {
  PARTICIPANTS_RESOLVER,
  type ParticipantsResolverPort,
} from "./ports/participants-resolver.port.js";

const COMMUNITY = "c0ffee00-1234-4abc-8def-0123456789ab";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PERIOD = "2026-09";
const CONSUMER = "11111111-2222-4333-8444-555555555555";
const PRODUCER = "22222222-2222-4333-8444-555555555555";
const INV = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

describe("reporting HTTP (INT-112)", () => {
  let app: INestApplication;
  let base: string;
  let service: ReportingService;
  let resolver: ParticipantsResolverPort;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address();
    if (address === null || typeof address === "string") {
      throw new Error("expected TCP address");
    }
    base = `http://127.0.0.1:${address.port}`;
    service = app.get(ReportingService);
    resolver = app.get<ParticipantsResolverPort>(PARTICIPANTS_RESOLVER);
  });

  beforeEach(() => {
    service.resetStore();
    // INT-373 — the IdP sub of the seeded member is bound to the registry CONSUMER id.
    resolver.resolveByIdpSub = async (sub: string) =>
      sub === CONSUMER ? { participantId: CONSUMER, communityId: COMMUNITY } : null;
    service.projectInvoice({
      invoiceId: INV,
      communityId: COMMUNITY,
      producerId: PRODUCER,
      consumerId: CONSUMER,
      period: PERIOD,
      currency: "EUR",
      status: "Open",
      total: "10.00",
      tradeIds: ["t1"],
      energyKwh: "4.50",
    });
    service.projectPayment({
      paymentId: "cccccccc-cccc-4ccc-8ddd-eeeeeeeeeeee",
      invoiceId: INV,
      communityId: COMMUNITY,
      amount: "10.00",
      currency: "EUR",
      status: "succeeded",
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /health is open", async () => {
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", module: "reporting" });
  });

  it("manager reads overview/summary; operator downloads KPI (REQ-018/032/047)", async () => {
    const denied = await fetch(
      `${base}/v1/communities/${COMMUNITY}/payments-overview`,
    );
    expect(denied.status).toBe(401);

    const overview = await fetch(
      `${base}/v1/communities/${COMMUNITY}/payments-overview`,
      {
        headers: {
          "x-intelligent-roles": "manager",
          "x-intelligent-community": COMMUNITY,
        },
      },
    );
    expect(overview.status).toBe(200);
    expect(await overview.json()).toHaveLength(1);

    const build = await fetch(`${base}/internal/v1/reports:build`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-intelligent-roles": "service",
      },
      body: JSON.stringify({ communityId: COMMUNITY, period: PERIOD }),
    });
    expect(build.status).toBe(202);

    const summary = await fetch(
      `${base}/v1/reports/summary?communityId=${COMMUNITY}&period=${PERIOD}`,
      {
        headers: {
          "x-intelligent-roles": "manager",
          "x-intelligent-community": COMMUNITY,
        },
      },
    );
    expect(summary.status).toBe(200);
    expect(await summary.json()).toMatchObject({
      invoiceCount: 1,
      paymentCount: 1,
      total: "10.00",
    });

    const exportKpi = await fetch(`${base}/internal/v1/kpi-exports`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-intelligent-roles": "service",
      },
      body: JSON.stringify({ communityId: COMMUNITY, period: PERIOD }),
    });
    expect(exportKpi.status).toBe(202);

    const kpi = await fetch(
      `${base}/v1/kpi-exports/${PERIOD}?communityId=${COMMUNITY}`,
      { headers: { "x-intelligent-roles": "operator" } },
    );
    expect(kpi.status).toBe(200);
    expect(kpi.headers.get("content-type")).toContain("application/octet-stream");
    const body = await kpi.text();
    expect(body).toContain(INV);
    expect(body).toContain("10.00");
  });

  // UAT-060 — community B must not read community A's reports or history.
  it("UAT-060 — another community cannot read overview, summary or history (REQ-049)", async () => {
    const overview = await fetch(
      `${base}/v1/communities/${COMMUNITY}/payments-overview`,
      {
        headers: {
          "x-intelligent-roles": "manager",
          "x-intelligent-token-use": "user",
          "x-intelligent-sub": "manager-b",
          "x-intelligent-community": OTHER,
        },
      },
    );
    expect(overview.status).toBe(403);

    const summary = await fetch(
      `${base}/v1/reports/summary?communityId=${COMMUNITY}&period=${PERIOD}`,
      {
        headers: {
          "x-intelligent-roles": "manager",
          "x-intelligent-token-use": "user",
          "x-intelligent-sub": "manager-b",
          "x-intelligent-community": OTHER,
        },
      },
    );
    expect(summary.status).toBe(403);

    const foreignHistory = await fetch(
      `${base}/v1/participants/${CONSUMER}/history`,
      {
        headers: {
          "x-intelligent-roles": "manager",
          "x-intelligent-token-use": "user",
          "x-intelligent-sub": "manager-b",
          "x-intelligent-community": OTHER,
        },
      },
    );
    expect(foreignHistory.status).toBe(404);

    const ownHistory = await fetch(
      `${base}/v1/participants/${CONSUMER}/history`,
      {
        headers: {
          "x-intelligent-roles": "member",
          "x-intelligent-token-use": "user",
          "x-intelligent-sub": CONSUMER,
          "x-intelligent-community": COMMUNITY,
        },
      },
    );
    expect(ownHistory.status).toBe(200);
    const history = (await ownHistory.json()) as { invoices: unknown[] };
    expect(history.invoices).toHaveLength(1);

    const otherMember = await fetch(
      `${base}/v1/participants/${PRODUCER}/history`,
      {
        headers: {
          "x-intelligent-roles": "member",
          "x-intelligent-token-use": "user",
          "x-intelligent-sub": CONSUMER,
          "x-intelligent-community": COMMUNITY,
        },
      },
    );
    expect(otherMember.status).toBe(404);

    const unbound = await fetch(
      `${base}/v1/participants/${CONSUMER}/history`,
      {
        headers: {
          "x-intelligent-roles": "member",
          "x-intelligent-token-use": "user",
          "x-intelligent-sub": "unbound-sub",
          "x-intelligent-community": COMMUNITY,
        },
      },
    );
    expect(unbound.status).toBe(404);
  });
});
