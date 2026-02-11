import type { ThemeConfig } from "antd";

/**
 * INT-188 — Gridline Energy graphics + Night Operator density.
 * Forest teal / mist surfaces (option 1) with compact ops chrome (option 3).
 * Kept local so we do not pull @refinedev/antd → @ant-design/pro-layout
 * (path-to-regexp CVE-2026-4926).
 */
export const brand = {
  ink: "#0f2a24",
  forest: "#1a4d3e",
  canopy: "#2d6a5a",
  mist: "#e8f0ec",
  mistDeep: "#d5e4dc",
  paper: "#ffffff",
  sider: "#0f2a24",
  siderMuted: "#3d5c52",
  siderHover: "#16352c",
  siderActive: "#1a4d3e",
} as const;

export const fontFamily =
  '"Plus Jakarta Sans", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export const appTheme: ThemeConfig = {
  token: {
    colorPrimary: brand.forest,
    colorInfo: brand.canopy,
    colorSuccess: "#3d8b6e",
    colorWarning: "#b7791f",
    colorError: "#c53d3d",
    colorText: brand.ink,
    colorTextSecondary: "#3d5c52",
    colorBgLayout: brand.mist,
    colorBgContainer: brand.paper,
    colorBorder: brand.mistDeep,
    colorBorderSecondary: "#cfdfd6",
    borderRadius: 6,
    borderRadiusLG: 8,
    fontFamily,
    fontSize: 13,
    fontSizeHeading2: 22,
    fontSizeHeading3: 16,
    controlHeight: 34,
    controlHeightLG: 40,
    wireframe: false,
  },
  components: {
    Layout: {
      headerBg: brand.paper,
      headerHeight: 48,
      siderBg: brand.sider,
      bodyBg: brand.mist,
      triggerBg: brand.siderHover,
      triggerColor: brand.mist,
    },
    Menu: {
      darkItemBg: brand.sider,
      darkSubMenuItemBg: brand.sider,
      darkItemColor: "#c5d6ce",
      darkItemHoverBg: brand.siderHover,
      darkItemHoverColor: "#ffffff",
      darkItemSelectedBg: brand.siderActive,
      darkItemSelectedColor: "#ffffff",
      itemBorderRadius: 6,
      itemMarginInline: 6,
      itemHeight: 34,
      iconSize: 14,
      fontSize: 13,
    },
    Table: {
      cellPaddingBlock: 8,
      cellPaddingInline: 10,
      headerBg: brand.mistDeep,
      headerColor: brand.ink,
      rowHoverBg: "#f3f8f5",
      fontSize: 13,
    },
    List: {
      itemPadding: "8px 0",
    },
    Button: {
      primaryShadow: "none",
      defaultShadow: "none",
      fontWeight: 600,
      controlHeight: 34,
      paddingInline: 14,
    },
    Card: {
      borderRadiusLG: 8,
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
  },
};
