import { describe, expect, it } from "vitest";
import { appTheme, brand, fontFamily } from "./theme";

describe("appTheme (INT-188 Gridline Energy + Night Operator)", () => {
  it("uses forest teal primary instead of Ant Design default blue", () => {
    expect(appTheme.token?.colorPrimary).toBe(brand.forest);
    expect(appTheme.token?.colorPrimary).not.toBe("#1677ff");
  });

  it("sets mist layout background and ink text", () => {
    expect(appTheme.token?.colorBgLayout).toBe(brand.mist);
    expect(appTheme.token?.colorText).toBe(brand.ink);
  });

  it("loads Plus Jakarta Sans as the UI font stack", () => {
    expect(fontFamily).toMatch(/Plus Jakarta Sans/);
    expect(appTheme.token?.fontFamily).toBe(fontFamily);
  });

  it("uses a dark forest sider for Gridline Energy chrome", () => {
    expect(appTheme.components?.Layout?.siderBg).toBe(brand.sider);
    expect(appTheme.components?.Menu?.darkItemBg).toBe(brand.sider);
    expect(brand.sider).toBe("#0f2a24");
  });

  it("keeps Night Operator compact control and table density", () => {
    expect(appTheme.token?.fontSize).toBe(13);
    expect(appTheme.token?.controlHeight).toBe(34);
    expect(appTheme.components?.Table?.cellPaddingBlock).toBe(8);
    expect(appTheme.components?.Menu?.itemHeight).toBe(34);
    expect(appTheme.components?.Layout?.headerHeight).toBe(48);
  });
});
