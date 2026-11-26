import { describe, expect, it } from "vitest";
import {
  NoopParticipantsResolver,
  createParticipantsResolver,
} from "./participants-resolver.port.js";

describe("participants-resolver.port (INT-463)", () => {
  it("NoopParticipantsResolver always returns null", async () => {
    await expect(
      new NoopParticipantsResolver().resolveByIdpSub("any"),
    ).resolves.toBeNull();
  });

  it("createParticipantsResolver always returns the no-op (by-idp-sub removed)", () => {
    const resolver = createParticipantsResolver({
      PARTICIPANTS_INTERNAL_URL: "http://participants.internal",
    });
    expect(resolver).toBeInstanceOf(NoopParticipantsResolver);
  });
});
