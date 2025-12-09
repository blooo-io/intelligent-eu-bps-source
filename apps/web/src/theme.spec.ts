import { describe, expect, it } from "vitest";
import { appTheme } from "./theme";

describe("appTheme", () => {
  it("defines a primary colour for Ant Design", () => {
    expect(appTheme.token?.colorPrimary).toBeTruthy();
  });
});
