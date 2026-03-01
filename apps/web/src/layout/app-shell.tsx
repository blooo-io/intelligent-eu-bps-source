import { useMemo, useState } from "react";
import { Button, Layout, Menu, Typography, theme } from "antd";
import { useLogout } from "@refinedev/core";
import { Link, Outlet, useLocation } from "react-router";
import { brand } from "../theme";

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

const NAV_ITEMS = [
  { key: "/", label: "Home", to: "/" },
  { key: "/onboarding", label: "Get ready", to: "/onboarding" },
  { key: "/profile", label: "Profile", to: "/profile" },
  { key: "/terms", label: "Terms", to: "/terms" },
  { key: "/payment-setup", label: "Payment setup", to: "/payment-setup" },
  { key: "/balances", label: "Balances", to: "/balances" },
  { key: "/invoices", label: "Invoices", to: "/invoices" },
  { key: "/privacy", label: "Privacy", to: "/privacy" },
  { key: "/community-settings", label: "Community settings", to: "/community-settings" },
  { key: "/participants", label: "Participants", to: "/participants" },
  { key: "/billing-runs", label: "Billing runs", to: "/billing-runs" },
  { key: "/payments-overview", label: "Payments overview", to: "/payments-overview" },
  { key: "/reports", label: "Reports", to: "/reports" },
  { key: "/operator", label: "Operator", to: "/operator" },
] as const;

/**
 * Authenticated shell (INT-187 / INT-188).
 * Dark forest sider (Gridline Energy) with compact Night Operator density.
 */
export function AppShell() {
  const location = useLocation();
  const { mutate: logout } = useLogout();
  const [collapsed, setCollapsed] = useState(false);
  const { token } = theme.useToken();

  const selected = useMemo(() => {
    const match = NAV_ITEMS.find(
      (item) => item.to !== "/" && location.pathname.startsWith(item.to),
    );
    return [match?.key ?? "/"];
  }, [location.pathname]);

  const menuItems = NAV_ITEMS.map((item) => ({
    key: item.key,
    label: <Link to={item.to}>{item.label}</Link>,
  }));

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        breakpoint="lg"
        width={220}
        collapsedWidth={64}
        theme="dark"
        style={{ background: brand.sider }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: collapsed ? "14px 8px" : "14px 16px",
            borderBottom: `1px solid ${brand.siderHover}`,
            minHeight: 48,
          }}
        >
          <span className="ge-brand-mark" aria-hidden>
            INT
          </span>
          {!collapsed ? (
            <Text
              strong
              style={{
                color: brand.mist,
                display: "block",
                whiteSpace: "nowrap",
                fontSize: 13,
                letterSpacing: "0.02em",
              }}
            >
              INTELLIGENT billing
            </Text>
          ) : null}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={selected}
          items={menuItems}
          style={{ borderInlineEnd: 0, background: brand.sider }}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            background: token.colorBgContainer,
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            paddingInline: 20,
            height: 48,
            lineHeight: "48px",
          }}
        >
          <Button size="small" onClick={() => logout()}>
            Sign out
          </Button>
        </Header>
        <Content style={{ padding: "16px 20px", background: token.colorBgLayout }}>
          <div style={{ maxWidth: 1280, margin: "0 auto" }}>
            <Outlet />
          </div>
        </Content>
      </Layout>
    </Layout>
  );
}
