import type { ReactNode } from "react";
import { Space, Spin, Typography } from "antd";

const { Title, Paragraph } = Typography;

/**
 * Content chrome inside AppShell (INT-187 / INT-188).
 * Compact page header so ops tables and lists keep vertical room.
 * Pages must not use full-viewport `<main>` wrappers or a "Back to home" link —
 * navigation lives in the sider.
 */
export function PageFrame({
  title,
  description,
  actions,
  loading,
  children,
}: Readonly<{
  title: string;
  description?: string;
  actions?: ReactNode;
  loading?: boolean;
  children?: ReactNode;
}>) {
  if (loading) {
    return (
      <div style={{ display: "grid", placeItems: "center", minHeight: 200 }} data-testid="page-loading">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }} data-testid="page-frame">
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          alignItems: "flex-start",
          justifyContent: "space-between",
        }}
      >
        <div style={{ minWidth: 0, flex: "1 1 220px" }}>
          <Title level={3} style={{ margin: 0 }}>
            {title}
          </Title>
          {description ? (
            <Paragraph type="secondary" style={{ margin: "4px 0 0", fontSize: 13 }}>
              {description}
            </Paragraph>
          ) : null}
        </div>
        {actions ? <div style={{ flex: "0 0 auto" }}>{actions}</div> : null}
      </div>
      {children}
    </Space>
  );
}
