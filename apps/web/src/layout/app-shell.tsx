import { useMemo, useState } from "react";
import { Button, Layout, Menu, Typography, theme } from "antd";
import { useLogout } from "@refinedev/core";
import { Link, Outlet, useLocation } from "react-router";

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

const NAV_ITEMS = [
  { key: "/", label: "Home", to: "/" },
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
 * Authenticated shell (INT-187).
 * Replaces the home-page flex row that squeezed the brand into a vertical column.
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
        width={240}
        style={{ background: token.colorBgContainer }}
      >
        <div
          style={{
            padding: collapsed ? "16px 8px" : "16px 20px",
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          <Text strong style={{ display: "block", whiteSpace: "nowrap" }}>
            {collapsed ? "INT" : "INTELLIGENT billing"}
          </Text>
        </div>
        <Menu
          mode="inline"
          selectedKeys={selected}
          items={menuItems}
          style={{ borderInlineEnd: 0 }}
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
            paddingInline: 24,
            height: 56,
            lineHeight: "56px",
          }}
        >
          <Button onClick={() => logout()}>Sign out</Button>
        </Header>
        <Content style={{ padding: 24, background: token.colorBgLayout }}>
          <div style={{ maxWidth: 960, margin: "0 auto" }}>
            <Outlet />
          </div>
        </Content>
      </Layout>
    </Layout>
  );
}
