import { describe, expect, it, vi } from "vitest";
import {
  createPersonalDataSources,
  FixturePersonalDataSources,
  HttpPersonalDataSources,
} from "./personal-data-sources.port.js";

const PARTICIPANT = "11111111-2222-4333-8444-555555555555";

describe("personal-data-sources.port (REQ-013 / Task 3.20)", () => {
  it("createPersonalDataSources returns Fixture without internal URLs", () => {
    const sources = createPersonalDataSources({});
    expect(sources).toBeInstanceOf(FixturePersonalDataSources);
  });

  it("createPersonalDataSources returns Http when all three URLs are set", () => {
    const sources = createPersonalDataSources({
      PARTICIPANTS_INTERNAL_URL: "http://participants:8080",
      PAYMENTS_INTERNAL_URL: "http://payments:8080",
      INVOICING_INTERNAL_URL: "http://invoicing:8080",
    });
    expect(sources).toBeInstanceOf(HttpPersonalDataSources);
  });

  it("FixturePersonalDataSources returns the Lisboa sample payload", async () => {
    const sources = new FixturePersonalDataSources();
    const participant = await sources.getParticipantPersonalData(PARTICIPANT);
    expect(participant.postalAddress?.city).toBe("Lisboa");
    expect(participant.consents.termsVersion).toBe("v1.0.0");
    const payment = await sources.getPaymentAccountPersonalData(PARTICIPANT);
    expect(payment?.kycVerified).toBe(true);
    const invoices = await sources.listInvoices(PARTICIPANT);
    expect(invoices).toHaveLength(3);
    expect(invoices[0]?.issuedAt).toBe("2026-11-30T00:00:00.000Z");
  });

  it("HttpPersonalDataSources calls AC-03 / AC-06 / AC-07 internal paths", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes("/personal-data") && url.includes("participants")) {
        return new Response(
          JSON.stringify({
            participantId: PARTICIPANT,
            communityId: "c0ffee00-1234-4abc-8def-0123456789ab",
            role: "consumer",
            source: "ewds",
            marketActorId: "m",
            meterId: "m1",
            profile: { name: "A", address: "B", email: "a@example.invalid" },
            postalAddress: null,
            phone: null,
            idpUserId: null,
            consents: {
              termsVersion: "v1.0.0",
              termsAcceptedAt: null,
              selfBillingMandate: false,
            },
            readiness: "Ready",
            kycVerified: true,
          }),
          { status: 200 },
        );
      }
      if (url.includes("payment-accounts")) {
        return new Response("", { status: 404 });
      }
      if (url.includes("/invoices")) {
        return new Response(JSON.stringify({ items: [] }), { status: 200 });
      }
      return new Response("", { status: 500 });
    });

    const sources = new HttpPersonalDataSources(
      {
        participants: "http://participants:8080/",
        payments: "http://payments:8080",
        invoicing: "http://invoicing:8080",
      },
      fetchImpl as never,
      "test-token",
    );

    await expect(
      sources.getParticipantPersonalData(PARTICIPANT),
    ).resolves.toMatchObject({ participantId: PARTICIPANT });
    await expect(
      sources.getPaymentAccountPersonalData(PARTICIPANT),
    ).resolves.toBeNull();
    await expect(sources.listInvoices(PARTICIPANT)).resolves.toEqual([]);

    expect(fetchImpl).toHaveBeenCalledWith(
      "http://participants:8080/internal/v1/participants/11111111-2222-4333-8444-555555555555/personal-data",
      expect.objectContaining({ method: "GET" }),
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://payments:8080/internal/v1/payment-accounts/11111111-2222-4333-8444-555555555555/personal-data",
      expect.objectContaining({ method: "GET" }),
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://invoicing:8080/internal/v1/participants/11111111-2222-4333-8444-555555555555/invoices",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("HttpPersonalDataSources surfaces non-OK responses", async () => {
    const boom = vi.fn(async () => new Response("", { status: 503 }));
    const sources = new HttpPersonalDataSources(
      {
        participants: "http://participants:8080",
        payments: "http://payments:8080",
        invoicing: "http://invoicing:8080",
      },
      boom as never,
      "test-token",
    );
    await expect(
      sources.getParticipantPersonalData(PARTICIPANT),
    ).rejects.toThrow(/participants personal-data failed with 503/);

    const payFail = vi.fn(async () => new Response("", { status: 500 }));
    const paySources = new HttpPersonalDataSources(
      {
        participants: "http://participants:8080",
        payments: "http://payments:8080",
        invoicing: "http://invoicing:8080",
      },
      payFail as never,
      "test-token",
    );
    await expect(
      paySources.getPaymentAccountPersonalData(PARTICIPANT),
    ).rejects.toThrow(/payments personal-data failed with 500/);

    const invFail = vi.fn(async () => new Response("", { status: 502 }));
    const invSources = new HttpPersonalDataSources(
      {
        participants: "http://participants:8080",
        payments: "http://payments:8080",
        invoicing: "http://invoicing:8080",
      },
      invFail as never,
      "test-token",
    );
    await expect(invSources.listInvoices(PARTICIPANT)).rejects.toThrow(
      /invoicing list invoices failed with 502/,
    );
  });

  it("HttpPersonalDataSources returns payment personal-data on 200", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          participantId: PARTICIPANT,
          pspAccountRef: "acct_1",
          paymentMethodPresent: false,
          kycStatus: "pending",
          kycVerified: false,
          kycVerifiedAt: null,
          payoutAccountVerified: false,
          kycLog: [],
        }),
        { status: 200 },
      ),
    );
    const sources = new HttpPersonalDataSources(
      {
        participants: "http://participants:8080",
        payments: "http://payments:8080",
        invoicing: "http://invoicing:8080",
      },
      fetchImpl as never,
      "test-token",
    );
    await expect(
      sources.getPaymentAccountPersonalData(PARTICIPANT),
    ).resolves.toMatchObject({ pspAccountRef: "acct_1" });
  });
});
