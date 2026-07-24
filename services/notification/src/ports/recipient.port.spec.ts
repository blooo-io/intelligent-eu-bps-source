import { describe, expect, it, vi } from "vitest";
import {
  createRecipient,
  HttpRecipient,
  MapRecipient,
} from "./recipient.port.js";

describe("recipient port (INT-274)", () => {
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
});
