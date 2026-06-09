import type { ThemeConfig } from "antd";

/**
 * INT-250 — Volt palette (approved): near-black chrome, chalk surfaces, lime CTAs.
 * High-contrast graphic system; replaces muted forest Gridline chrome.
 */
export const brand = {
  ink: "#0A0F0D",
  accent: "#C8F542",
  accentText: "#0A0F0D",
  paper: "#FFFFFF",
  chalk: "#F3F6F2",
  chalkDeep: "#D5DDD6",
  muted: "#5C6B64",
  sider: "#0A0F0D",
  siderMuted: "#8A9A92",
  siderHover: "#161D1A",
  siderActive: "#C8F542",
  money: "#0A0F0D",
  ok: "#1F8A4C",
  danger: "#E23D3D",
  /** @deprecated Use brand.accent — kept for transitional call sites. */
  canopy: "#C8F542",
  /** @deprecated Use brand.ink */
  forest: "#0A0F0D",
  /** @deprecated Use brand.chalk */
  mist: "#F3F6F2",
  /** @deprecated Use brand.chalkDeep */
  mistDeep: "#D5DDD6",
} as const;

export const fontFamily =
  '"Plus Jakarta Sans", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export const appTheme: ThemeConfig = {
  token: {
    colorPrimary: brand.ink,
    colorInfo: brand.muted,
    colorSuccess: brand.ok,
    colorWarning: "#B7791F",
    colorError: brand.danger,
    colorText: brand.ink,
    colorTextSecondary: brand.muted,
    colorBgLayout: brand.chalk,
    colorBgContainer: brand.paper,
    colorBorder: brand.chalkDeep,
    colorBorderSecondary: "#E2E8E4",
    borderRadius: 4,
    borderRadiusLG: 6,
    fontFamily,
    fontSize: 13,
    fontSizeHeading2: 22,
    fontSizeHeading3: 18,
    controlHeight: 36,
    controlHeightLG: 42,
    wireframe: false,
  },
  components: {
    Layout: {
      headerBg: brand.paper,
      headerHeight: 52,
      siderBg: brand.sider,
      bodyBg: brand.chalk,
      triggerBg: brand.siderHover,
      triggerColor: brand.accent,
    },
    Menu: {
      darkItemBg: brand.sider,
      darkSubMenuItemBg: brand.sider,
      darkItemColor: "#D7E0DA",
      darkItemHoverBg: brand.siderHover,
      darkItemHoverColor: "#FFFFFF",
      darkItemSelectedBg: brand.accent,
      darkItemSelectedColor: brand.accentText,
      darkGroupTitleColor: "#8A9A92",
      itemBorderRadius: 4,
      itemMarginInline: 8,
      itemHeight: 36,
      iconSize: 14,
      fontSize: 13,
    },
    Table: {
      cellPaddingBlock: 10,
      cellPaddingInline: 12,
      headerBg: brand.chalk,
      headerColor: brand.ink,
      rowHoverBg: "#EEF3EF",
      fontSize: 13,
    },
    List: {
      itemPadding: "8px 0",
    },
    Button: {
      primaryShadow: "none",
      defaultShadow: "none",
      fontWeight: 650,
      controlHeight: 36,
      paddingInline: 16,
      primaryColor: brand.accentText,
    },
    Card: {
      borderRadiusLG: 6,
      paddingLG: 16,
      headerFontSize: 14,
    },
    Form: {
      itemMarginBottom: 12,
      verticalLabelPadding: "0 0 4px",
    },
    Typography: {
      titleMarginBottom: 0,
      titleMarginTop: 0,
    },
    Tag: {
      defaultBg: brand.chalk,
      defaultColor: brand.ink,
    },
  },
};
