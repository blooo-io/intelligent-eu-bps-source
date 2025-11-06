import { describe, expect, it } from "vitest";
import { MockIdpAdapter } from "./mock-idp.adapter.js";

describe("MockIdpAdapter (P-IDP)", () => {
  it("createUser + sendInvitation + deleteUser", async () => {
    const idp = new MockIdpAdapter();
    const user = await idp.createUser({
      email: "a@example.com",
      communityId: "c1",
      role: "consumer",
    });
    expect(user.userId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    await idp.sendInvitation(user.userId);
    expect(idp.invitations.has(user.userId)).toBe(true);
    await idp.deleteUser(user.userId);
    expect(idp.deleted.has(user.userId)).toBe(true);
    await expect(idp.sendInvitation(user.userId)).rejects.toThrow(/unknown/);
  });
});
