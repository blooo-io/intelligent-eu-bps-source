/**
 * REQ-051 / A7 — mock hosted KYC link and Identity verification (INT-431).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { MockPspAdapter } from "./mock-psp.adapter.js";
import { KYC_WEBHOOK_EVENTS } from "./kyc-onboarding.port.js";

describe("MockPspAdapter hosted KYC + Identity (REQ-051)", () => {
  let adapter: MockPspAdapter;

  beforeEach(() => {
    adapter = new MockPspAdapter();
  });

  it("mock hosted link and identity are deterministic", async () => {
    const link = await adapter.createHostedKycLink("acct_mock_1", {
      returnUrl: "https://app.example/return",
      refreshUrl: "https://app.example/refresh",
    });
    expect(link.url).toMatch(/^https:\/\/mock-psp\.local\/kyc\//);
    expect(link.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const session = await adapter.createIdentityVerification({
      subjectId: "m-1",
      returnUrl: "https://app.example/return",
    });
    expect(session.url).toMatch(/^https:\/\/mock-psp\.local\/identity\//);
    expect(session.verificationId).toMatch(/\S+/);

    await expect(
      adapter.getIdentityVerification("vs_mock_verified"),
    ).resolves.toEqual({ status: "verified", errorCode: null });
  });

  it("REQ-045: getAccountSession exposes payoutsEnabled when KYC complete", async () => {
    const { pspAccountRef } = await adapter.createConnectedAccount({
      participantId: "p-1",
      country: "FR",
    });
    await adapter.completeKyc(pspAccountRef);
    const session = await adapter.getAccountSession(pspAccountRef);
    expect(session.payoutsEnabled).toBe(true);
  });

  it("exports KYC_WEBHOOK_EVENTS for Connect + Identity", () => {
    expect(KYC_WEBHOOK_EVENTS).toContain("account.updated");
    expect(KYC_WEBHOOK_EVENTS).toContain("identity.verification_session.verified");
  });
});
