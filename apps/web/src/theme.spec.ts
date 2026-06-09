import { describe, expect, it } from "vitest";
import { appTheme, brand, fontFamily } from "./theme";

describe("appTheme (INT-250 Volt)", () => {
  it("uses near-black primary with lime selected chrome", () => {
    expect(appTheme.token?.colorPrimary).toBe(brand.ink);
    expect(brand.accent).toBe("#C8F542");
    expect(appTheme.token?.colorPrimary).not.toBe("#1677ff");
  });

  it("sets chalk layout background and ink text", () => {
    expect(appTheme.token?.colorBgLayout).toBe(brand.chalk);
    expect(appTheme.token?.colorText).toBe(brand.ink);
  });

  it("loads Plus Jakarta Sans as the UI font stack", () => {
    expect(fontFamily).toMatch(/Plus Jakarta Sans/);
    expect(appTheme.token?.fontFamily).toBe(fontFamily);
  });

  it("uses Volt near-black sider with lime selected item", () => {
    expect(appTheme.components?.Layout?.siderBg).toBe(brand.sider);
    expect(appTheme.components?.Menu?.darkItemBg).toBe(brand.sider);
    expect(brand.sider).toBe("#0A0F0D");
    expect(appTheme.components?.Menu?.darkItemSelectedBg).toBe(brand.accent);
  });

  it("keeps compact control and table density", () => {
    expect(appTheme.token?.fontSize).toBe(13);
    expect(appTheme.token?.controlHeight).toBe(36);
    expect(appTheme.components?.Table?.cellPaddingBlock).toBe(10);
    expect(appTheme.components?.Menu?.itemHeight).toBe(36);
    expect(appTheme.components?.Layout?.headerHeight).toBe(52);
  });
});
