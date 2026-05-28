import { useEffect, useMemo, useState } from "react";
import { Button, Layout, Menu, Space, Tag, Typography, theme } from "antd";
import { useGetIdentity, useLogout } from "@refinedev/core";
import { Link, Outlet, useLocation } from "react-router";
import { fetchMe, type Me } from "../api/me";
import type { WebConfig } from "../api/config";
import type { OidcFacade } from "../auth/oidc";
import { brand } from "../theme";
import { visibleNavItems } from "./nav-access";

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

type Identity = {
  id?: string;
  name?: string;
  roles?: string[];
  communityId?: string;
};

/**
 * Authenticated shell (INT-187 / INT-188 / INT-243).
 * Dark forest sider; nav filtered by IdP role + member readiness.
 * Header shows who is signed in (name, roles, community).
 */
export function AppShell({
  config,
  oidc,
}: {
  config?: WebConfig;
  oidc?: OidcFacade;
} = {}) {
  const location = useLocation();
  const { mutate: logout } = useLogout();
  const { data: identity } = useGetIdentity<Identity>();
  const [collapsed, setCollapsed] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const { token } = theme.useToken();

  useEffect(() => {
    if (!config || !oidc) return;
    let cancelled = false;
    (async () => {
      try {
        const access = await oidc.getAccessToken();
        if (!access) return;
        const row = await fetchMe(config.apiBaseUrl, access);
        if (!cancelled) setMe(row);
      } catch {
        // Identity header still works from token claims if /v1/me fails.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [config, oidc]);

  const roles = identity?.roles ?? [];
  const navItems = useMemo(
    () => visibleNavItems(roles, me?.readiness),
    [roles, me?.readiness],
  );

  const selected = useMemo(() => {
    const match = navItems.find(
      (item) => item.to !== "/" && location.pathname.startsWith(item.to),
    );
    return [match?.key ?? "/"];
  }, [location.pathname, navItems]);

  const menuItems = navItems.map((item) => ({
    key: item.key,
    label: <Link to={item.to}>{item.label}</Link>,
  }));

  const displayName =
    me?.profile?.name?.trim() ||
    identity?.name ||
    identity?.id ||
    "Signed in";
  const roleLabel =
    roles.length > 0 ? roles.join(", ") : "role unknown";
  const communityLabel = identity?.communityId ?? me?.communityId;

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
            justifyContent: "space-between",
            gap: 12,
            paddingInline: 20,
            height: 48,
            lineHeight: "48px",
          }}
        >
          <Space size={8} wrap style={{ lineHeight: 1.3, maxWidth: "78%" }}>
            <Text strong data-testid="shell-user-name">
              {displayName}
            </Text>
            <span data-testid="shell-user-roles">
              {roles.length > 0 ? (
                roles.map((role) => (
                  <Tag key={role} color="green" style={{ marginInlineEnd: 4 }}>
                    {role}
                  </Tag>
                ))
              ) : (
                <Text type="secondary">{roleLabel}</Text>
              )}
            </span>
            {communityLabel ? (
              <Text
                type="secondary"
                title="Billing community id — tenancy for settings, trades and runs (not a person)"
                data-testid="shell-community-id"
                style={{ fontSize: 12 }}
              >
                Community{" "}
                <Text code style={{ fontSize: 11 }}>
                  {communityLabel}
                </Text>
              </Text>
            ) : null}
          </Space>
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
