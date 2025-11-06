import { describe, expect, it } from "vitest";
import type { ParticipantRecord } from "../domain/types.js";
import { deriveReadiness, isInvoiceReady } from "./readiness.js";

function base(over: Partial<ParticipantRecord> = {}): ParticipantRecord {
  return {
    participantId: "p1",
    communityId: "c1",
    role: "producer",
    status: "Invited",
    marketActorId: "m1",
    meterId: "meter-1",
    idpUserId: "u1",
    profile: null,
    termsVersionAccepted: null,
    selfBillingMandate: false,
    paymentAccountReady: false,
    paymentBlockReason: null,
    ...over,
  };
}

describe("deriveReadiness (02 §5)", () => {
  it("walks Invited → ProfileCompleted → TermsAccepted → Ready", () => {
    expect(deriveReadiness(base())).toBe("Invited");
    expect(
      deriveReadiness(
        base({
          profile: { name: "A", address: "B", email: "a@example.com" },
        }),
      ),
    ).toBe("ProfileCompleted");
    expect(
      deriveReadiness(
        base({
          profile: { name: "A", address: "B", email: "a@example.com" },
          termsVersionAccepted: "v1.0.0",
        }),
      ),
    ).toBe("TermsAccepted");
    expect(
      deriveReadiness(
        base({
          profile: { name: "A", address: "B", email: "a@example.com" },
          termsVersionAccepted: "v1.0.0",
          paymentAccountReady: true,
        }),
      ),
    ).toBe("Ready");
  });

  it("marks Restricted when payment is blocked (BR-09)", () => {
    const status = deriveReadiness(
      base({
        profile: { name: "A", address: "B", email: "a@example.com" },
        termsVersionAccepted: "v1.0.0",
        paymentAccountReady: false,
        paymentBlockReason: "kyc_revoked",
        status: "Ready",
      }),
    );
    expect(status).toBe("Restricted");
    expect(isInvoiceReady(status)).toBe(false);
  });

  it("keeps Offboarded sticky", () => {
    expect(deriveReadiness(base({ status: "Offboarded" }))).toBe("Offboarded");
  });
});
