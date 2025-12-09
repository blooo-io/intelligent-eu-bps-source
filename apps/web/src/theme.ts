import type { ThemeConfig } from "antd";

/**
 * Ant Design theme tokens for AC-01 (TD-5).
 * Kept local so we do not pull @refinedev/antd → @ant-design/pro-layout
 * (path-to-regexp CVE-2026-4926).
 */
export const appTheme: ThemeConfig = {
  token: {
    colorPrimary: "#1677ff",
    borderRadius: 6,
  },
};
