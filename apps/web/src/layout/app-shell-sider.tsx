import { Layout, Menu, Typography } from "antd";
import type { ItemType } from "antd/es/menu/interface";
import { brand } from "../theme";

const { Sider } = Layout;
const { Text } = Typography;

type AppShellSiderProps = {
  collapsed: boolean;
  onCollapse: (value: boolean) => void;
  communityLabel: string | null;
  menuItems: ItemType[];
  selectedKeys: string[];
};

export function AppShellSider({
  collapsed,
  onCollapse,
  communityLabel,
  menuItems,
  selectedKeys,
}: Readonly<AppShellSiderProps>) {
  return (
    <Sider
      collapsible
      collapsed={collapsed}
      onCollapse={onCollapse}
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
        selectedKeys={selectedKeys}
        items={menuItems}
        style={{ borderInlineEnd: 0, background: brand.sider }}
      />
    </Sider>
  );
}
