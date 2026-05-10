import { describe, expect, it, vi } from "vitest";
import {
  HttpParticipantsNotifier,
  NoopParticipantsNotifier,
} from "./participants-notifier.port.js";

describe("ParticipantsNotifierPort (INT-193)", () => {
  it("NoopParticipantsNotifier resolves", async () => {
    await expect(
      new NoopParticipantsNotifier().applyPaymentAccountStatus({
        participantId: "p1",
        ready: true,
      }),
    ).resolves.toBeUndefined();
  });

  it("HttpParticipantsNotifier POSTs ready status", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    const http = new HttpParticipantsNotifier(
      "http://participants:8080/",
      "svc-token",
      fetchImpl as unknown as typeof fetch,
    );
    await http.applyPaymentAccountStatus({
      participantId: "p1",
      ready: true,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://participants:8080/internal/v1/participants/p1/payment-account-status",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer svc-token",
          "x-intelligent-roles": "service",
        }),
        body: JSON.stringify({ ready: true, reason: undefined }),
      }),
    );
  });

  it("HttpParticipantsNotifier throws on non-OK", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    const http = new HttpParticipantsNotifier(
      "http://participants:8080",
      "tok",
      fetchImpl as unknown as typeof fetch,
    );
    await expect(
      http.applyPaymentAccountStatus({ participantId: "p1", ready: false }),
    ).rejects.toThrow(/failed with 500/);
  });

  it("HttpParticipantsNotifier ignores 404 for unknown participants (INT-228)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    const http = new HttpParticipantsNotifier(
      "http://participants:8080",
      "tok",
      fetchImpl as unknown as typeof fetch,
    );
    await expect(
      http.applyPaymentAccountStatus({ participantId: "fixture-p", ready: true }),
    ).resolves.toBeUndefined();
  });
});
