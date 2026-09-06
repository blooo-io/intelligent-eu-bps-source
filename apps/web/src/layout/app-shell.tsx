import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Layout, theme } from "antd";
import type { ItemType } from "antd/es/menu/interface";
import { useGetIdentity, useLogout } from "@refinedev/core";
import { Link, Outlet, useLocation } from "react-router";
import { fetchMe, type Me } from "../api/me";
import type { WebConfig } from "../api/config";
import type { OidcFacade } from "../auth/oidc";
import { brand } from "../theme";
import { communityDisplayName } from "./community-label";
import { effectiveRoles } from "./effective-roles";
import { AppShellHeaderBar } from "./app-shell-header";
import { AppShellSider } from "./app-shell-sider";
import {
  labeledNavItems,
  navItemsByGroup,
  visibleNavItems,
} from "./nav-access";
import { marketRoleLabel } from "./role-home";

const { Content } = Layout;

type Identity = {
  id?: string;
  name?: string;
  roles?: string[];
  communityId?: string;
};

function headerRoleTagsFor(
  roles: string[],
  marketRole: Me["role"] | undefined,
): string[] {
  if (roles.includes("manager")) return ["Manager"];
  if (roles.includes("operator")) return ["Operator"];
  const market = marketRoleLabel(marketRole);
  if (market) return [market];
  if (roles.includes("member")) return ["Member"];
  return roles.map((r) => r.charAt(0).toUpperCase() + r.slice(1));
}

function memberSetupChrome(
  roles: string[],
  me: Me | null,
): { isMemberOnly: boolean; setupChrome: boolean; showSider: boolean } {
  const isMemberOnly =
    roles.includes("member") &&
    !roles.includes("manager") &&
    !roles.includes("operator");
  const setupChrome =
    isMemberOnly && me !== null && me.readiness !== "Ready";
  const showSider = !isMemberOnly || me === null || me.readiness === "Ready";
  return { isMemberOnly, setupChrome, showSider };
}

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
  const headerRoleTags = useMemo(
    () => headerRoleTagsFor(roles, me?.role),
    [roles, me?.role],
  );

  const { setupChrome, showSider } = memberSetupChrome(roles, me);

  return (
    <Layout
      style={{
        minHeight: "100vh",
        background: setupChrome ? brand.chalk : undefined,
      }}
    >
      {showSider ? (
        <AppShellSider
          collapsed={collapsed}
          onCollapse={setCollapsed}
          communityLabel={communityLabel}
          menuItems={menuItems}
          selectedKeys={selected}
        />
      ) : null}
      <Layout>
        <AppShellHeaderBar
          setupChrome={setupChrome}
          displayName={displayName}
          headerRoleTags={headerRoleTags}
          communityLabel={communityLabel}
          onLogout={() => logout()}
        />
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
