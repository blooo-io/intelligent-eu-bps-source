import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button, Layout, Menu, Space, Tag, Typography, theme } from "antd";
import type { ItemType } from "antd/es/menu/interface";
import { useGetIdentity, useLogout } from "@refinedev/core";
import { Link, Outlet, useLocation } from "react-router";
import { fetchMe, type Me } from "../api/me";
import type { WebConfig } from "../api/config";
import type { OidcFacade } from "../auth/oidc";
import { brand } from "../theme";
import { communityDisplayName } from "./community-label";
import { effectiveRoles } from "./effective-roles";
import {
  labeledNavItems,
  navItemsByGroup,
  visibleNavItems,
} from "./nav-access";
import { marketRoleLabel } from "./role-home";

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

type Identity = {
  id?: string;
  name?: string;
  roles?: string[];
  communityId?: string;
};

/**
 * Authenticated shell (INT-187 / INT-243 / INT-250 / INT-254 / INT-256).
 * Volt near-black sider when Ready; full-screen setup chrome (no sider) until then.
 *
 * INT-256: one Layout tree always — toggling setup vs desk must not remount
 * `<Outlet />` (Privacy / Reports mid-submit lost local state when two separate
 * `return` branches swapped).
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

  const roles = effectiveRoles(identity?.roles, me?.roles);
  const navItems = useMemo(
    () =>
      labeledNavItems(visibleNavItems(roles, me?.readiness), {
        roles,
        marketRole: me?.role,
        readiness: me?.readiness,
      }),
    [roles, me?.readiness, me?.role],
  );

  const selected = useMemo(() => {
    const match = navItems.find(
      (item) => item.to !== "/" && location.pathname.startsWith(item.to),
    );
    return [match?.key ?? "/"];
  }, [location.pathname, navItems]);

  const menuItems = useMemo((): ItemType[] => {
    return navItemsByGroup(navItems).map(({ group, items }) => ({
      type: "group" as const,
      key: `grp-${group}`,
      label: group,
      children: items.map(
        (item): ItemType => ({
          key: item.key,
          label: (<Link to={item.to}>{item.label}</Link>) as ReactNode,
        }),
      ),
    }));
  }, [navItems]);

  const displayName =
    me?.profile?.name?.trim() ||
    identity?.name ||
    identity?.id ||
    "Signed in";
  const communityLabel = communityDisplayName(
    me?.communityId ?? identity?.communityId,
  );
  // INT-252: header shows market role for members; IdP role for manager/operator.
  const headerRoleTags = useMemo(() => {
    if (roles.includes("manager")) return ["Manager"];
    if (roles.includes("operator")) return ["Operator"];
    const market = marketRoleLabel(me?.role);
    if (market) return [market];
    return roles.map((r) => r.charAt(0).toUpperCase() + r.slice(1));
  }, [roles, me?.role]);

  // INT-254 — member not Ready: no sider on any route (not only /onboarding).
  // Managers/operators keep the desk. Wait for /v1/me so Ready members do not
  // flash setup chrome; once readiness is known and incomplete, hide the menu.
  const isMemberOnly =
    roles.includes("member") &&
    !roles.includes("manager") &&
    !roles.includes("operator");
  const setupChrome =
    isMemberOnly && me !== null && me.readiness !== "Ready";
  // Desk sider while me is unknown (avoid setup flash for Ready) or Ready.
  const showSider = !isMemberOnly || me === null || me.readiness === "Ready";

  return (
    <Layout
      style={{
        minHeight: "100vh",
        background: setupChrome ? brand.chalk : undefined,
      }}
    >
      {showSider ? (
        <Sider
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          width={260}
          collapsedWidth={72}
          theme="dark"
          style={{ background: brand.sider }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 2,
              padding: collapsed ? "16px 10px" : "16px 18px",
              borderBottom: `1px solid ${brand.siderHover}`,
              minHeight: 56,
            }}
          >
            {collapsed ? (
              <Text strong style={{ color: brand.accent, fontSize: 12 }}>
                IB
              </Text>
            ) : (
              <>
                <Text
                  strong
                  style={{
                    color: brand.accent,
                    display: "block",
                    whiteSpace: "nowrap",
                    fontSize: 13,
                    letterSpacing: "0.02em",
                  }}
                >
                  Intelligent Billing & Payment
                </Text>
                {communityLabel ? (
                  <Text style={{ color: brand.siderMuted, fontSize: 11 }}>
                    {communityLabel}
                  </Text>
                ) : null}
              </>
            )}
          </div>
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={selected}
            items={menuItems}
            style={{ borderInlineEnd: 0, background: brand.sider }}
          />
        </Sider>
      ) : null}
      <Layout>
        <Header
          style={
            setupChrome
              ? {
                  background: brand.sider,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingInline: 20,
                  height: 56,
                  lineHeight: "56px",
                }
              : {
                  background: token.colorBgContainer,
                  borderBottom: `1px solid ${token.colorBorderSecondary}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  paddingInline: 20,
                  height: 52,
                  lineHeight: "52px",
                }
          }
        >
          {setupChrome ? (
            <>
              <Text strong style={{ color: brand.accent, letterSpacing: "0.02em" }}>
                Intelligent Billing & Payment
              </Text>
              <Space size={12}>
                <Text
                  data-testid="shell-user-name"
                  style={{ color: "#D7E0DA", fontSize: 13 }}
                >
                  {displayName}
                </Text>
                <span data-testid="shell-user-roles">
                  {headerRoleTags.map((role) => (
                    <Tag
                      key={role}
                      style={{
                        marginInlineEnd: 4,
                        color: brand.sider,
                        background: brand.accent,
                        border: "none",
                      }}
                    >
                      {role}
                    </Tag>
                  ))}
                </span>
                <Button size="small" onClick={() => logout()}>
                  Sign out
                </Button>
              </Space>
            </>
          ) : (
            <>
              <Space size={8} wrap style={{ lineHeight: 1.3, maxWidth: "78%" }}>
                <Text strong data-testid="shell-user-name">
                  {displayName}
                </Text>
                <span data-testid="shell-user-roles">
                  {headerRoleTags.length > 0 ? (
                    headerRoleTags.map((role) => (
                      <Tag key={role} style={{ marginInlineEnd: 4 }}>
                        {role}
                      </Tag>
                    ))
                  ) : (
                    <Text type="secondary">role unknown</Text>
                  )}
                </span>
                {communityLabel ? (
                  <Text
                    type="secondary"
                    data-testid="shell-community"
                    style={{ fontSize: 12 }}
                  >
                    {communityLabel}
                  </Text>
                ) : null}
              </Space>
              <Button size="small" onClick={() => logout()}>
                Sign out
              </Button>
            </>
          )}
        </Header>
        <Content
          style={
            setupChrome
              ? {
                  padding: "24px 20px",
                  maxWidth: 880,
                  margin: "0 auto",
                  width: "100%",
                }
              : { padding: "20px 24px", background: token.colorBgLayout }
          }
        >
          {/* Stable wrapper — never remount Outlet when chrome toggles (INT-256). */}
          <div
            style={
              setupChrome ? undefined : { maxWidth: 1280, margin: "0 auto" }
            }
          >
            <Outlet />
          </div>
        </Content>
      </Layout>
    </Layout>
  );
}
