import { Button, Layout, Space, Tag, Typography, theme } from "antd";
import { brand } from "../theme";

const { Header } = Layout;
const { Text } = Typography;

type AppShellHeaderProps = {
  setupChrome: boolean;
  displayName: string;
  headerRoleTags: string[];
  communityLabel: string | null;
  onLogout: () => void;
};

export function AppShellHeaderBar({
  setupChrome,
  displayName,
  headerRoleTags,
  communityLabel,
  onLogout,
}: Readonly<AppShellHeaderProps>) {
  const { token } = theme.useToken();
  const headerStyle = setupChrome
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
      };

  const inner = setupChrome ? (
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
          <Button size="small" onClick={onLogout}>
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
          {headerRoleTags.map((role) => (
            <Tag key={role} style={{ marginInlineEnd: 4 }}>
              {role}
            </Tag>
          ))}
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
      <Button size="small" onClick={onLogout}>
        Sign out
      </Button>
    </>
  );

  return <Header style={headerStyle}>{inner}</Header>;
}
