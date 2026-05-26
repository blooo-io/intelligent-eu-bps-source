import { describe, expect, it } from "vitest";
import { ApiError } from "./me";
import { userFacingMessage } from "./user-facing-error";

describe("userFacingMessage (INT-243)", () => {
  it("maps 403 to role guidance instead of raw API text", () => {
    const msg = userFacingMessage(
      new ApiError(403, "GET /v1/communities/{id}/settings failed with 403"),
    );
    expect(msg).toMatch(/do not have access/i);
    expect(msg).not.toMatch(/failed with 403/i);
  });

  it("maps 401, 404 and 5xx", () => {
    expect(userFacingMessage(new ApiError(401, "x"))).toMatch(/session expired/i);
    expect(userFacingMessage(new ApiError(404, "x"))).toMatch(/not found/i);
    expect(userFacingMessage(new ApiError(503, "x"))).toMatch(/temporarily unavailable/i);
  });

  it("passes through other Error messages and unknown values", () => {
    expect(userFacingMessage(new Error("No access token"))).toBe("No access token");
    expect(userFacingMessage("oops")).toMatch(/something went wrong/i);
  });
});
