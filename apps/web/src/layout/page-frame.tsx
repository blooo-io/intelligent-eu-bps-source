import type { ReactNode } from "react";
import { Space, Spin, Typography } from "antd";

const { Title, Paragraph } = Typography;

/**
 * Content chrome inside AppShell (INT-187).
 * Pages must not use full-viewport `<main>` wrappers or a "Back to home" link —
 * navigation lives in the sider.
 */
export function PageFrame({
  title,
  description,
  actions,
  loading,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  loading?: boolean;
  children?: ReactNode;
}) {
  if (loading) {
    return (
      <div style={{ display: "grid", placeItems: "center", minHeight: 240 }} data-testid="page-loading">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }} data-testid="page-frame">
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "flex-start",
          justifyContent: "space-between",
        }}
      >
        <div style={{ minWidth: 0, flex: "1 1 240px" }}>
          <Title level={2} style={{ margin: 0 }}>
            {title}
          </Title>
          {description ? (
            <Paragraph type="secondary" style={{ margin: "8px 0 0" }}>
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
