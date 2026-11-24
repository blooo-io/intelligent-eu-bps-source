import { describe, expect, it, vi } from "vitest";
import {
  createRecipient,
  HttpRecipient,
  MapRecipient,
} from "./recipient.port.js";

describe("recipient port (INT-274 / INT-428)", () => {
  it("uses MapRecipient without PARTICIPANTS_INTERNAL_URL", () => {
    expect(createRecipient({})).toBeInstanceOf(MapRecipient);
  });

  it("uses HttpRecipient when PARTICIPANTS_INTERNAL_URL is set", () => {
    expect(
      createRecipient({
        PARTICIPANTS_INTERNAL_URL: "http://participants:8080",
      }),
    ).toBeInstanceOf(HttpRecipient);
  });

  it("HttpRecipient returns email or null on 404", async () => {
    const ok = new HttpRecipient(
      "http://participants:8080",
      vi.fn(async () =>
        Response.json({
          participantId: "p1",
          email: " member@example.com ",
        }),
      ) as never,
    );
    await expect(ok.resolveEmail("p1")).resolves.toBe("member@example.com");

    const missing = new HttpRecipient(
      "http://participants:8080",
      vi.fn(async () => new Response(null, { status: 404 })) as never,
    );
    await expect(missing.resolveEmail("p1")).resolves.toBeNull();
  });

  it("MapRecipient resolves community manager e-mail (REQ-061)", async () => {
    const map = new MapRecipient(new Map());
    await expect(map.resolveCommunityManagerEmail("c1")).resolves.toBeNull();
    map.registerCommunityManager("c1", "manager@example.invalid");
    await expect(map.resolveCommunityManagerEmail("c1")).resolves.toBe(
      "manager@example.invalid",
    );
  });

  it("HttpRecipient resolveCommunityManagerEmail returns email or null on 404", async () => {
    const ok = new HttpRecipient(
      "http://participants:8080",
      vi.fn(async () =>
        Response.json({
          communityId: "c1",
          email: " manager@example.invalid ",
        }),
      ) as never,
    );
    await expect(ok.resolveCommunityManagerEmail("c1")).resolves.toBe(
      "manager@example.invalid",
    );

    const missing = new HttpRecipient(
      "http://participants:8080",
      vi.fn(async () => new Response(null, { status: 404 })) as never,
    );
    await expect(missing.resolveCommunityManagerEmail("c1")).resolves.toBeNull();
  });

  it("HttpRecipient throws on non-OK manager-contact and empty email becomes null", async () => {
    const failing = new HttpRecipient(
      "http://participants:8080/",
      vi.fn(async () => new Response(null, { status: 500 })) as never,
    );
    await expect(failing.resolveCommunityManagerEmail("c1")).rejects.toThrow(
      /getManagerContact/,
    );

    const empty = new HttpRecipient(
      "http://participants:8080",
      vi.fn(async () => Response.json({ communityId: "c1", email: "  " })) as never,
    );
    await expect(empty.resolveCommunityManagerEmail("c1")).resolves.toBeNull();

    const noEmail = new HttpRecipient(
      "http://participants:8080",
      vi.fn(async () => Response.json({ communityId: "c1" })) as never,
    );
    await expect(noEmail.resolveCommunityManagerEmail("c1")).resolves.toBeNull();
  });

  it("HttpRecipient throws on non-OK notification-contact", async () => {
    const failing = new HttpRecipient(
      "http://participants:8080",
      vi.fn(async () => new Response(null, { status: 503 })) as never,
    );
    await expect(failing.resolveEmail("p1")).rejects.toThrow(
      /getNotificationContact/,
    );
  });
});
