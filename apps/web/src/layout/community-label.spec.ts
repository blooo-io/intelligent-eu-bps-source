import { describe, expect, it } from "vitest";
import { communityDisplayName, S1_COMMUNITY_ID } from "./community-label";

describe("communityDisplayName (INT-250)", () => {
  it("maps the S1 demo tenancy to a human name", () => {
    expect(communityDisplayName(S1_COMMUNITY_ID)).toBe("Horizon Energy");
  });

  it("hides unknown UUIDs instead of leaking them", () => {
    expect(communityDisplayName("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(communityDisplayName(undefined)).toBeNull();
    expect(communityDisplayName("")).toBeNull();
  });
});
