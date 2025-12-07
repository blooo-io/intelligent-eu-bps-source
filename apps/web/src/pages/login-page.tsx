import { Button, Card, Space, Typography } from "antd";
import { useLogin } from "@refinedev/core";

const { Title, Paragraph } = Typography;

/**
 * Sign-in screen (INT-137 / UAT-043).
 * Only a CTA that redirects to the IdP — no password fields (REQ-033).
 */
export function LoginPage() {
  const { mutate: login, isPending } = useLogin();

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: "linear-gradient(160deg, #0f2a24 0%, #1a4d3e 45%, #e8f2ee 100%)",
      }}
    >
      <Card style={{ maxWidth: 420, width: "100%" }}>
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <Title level={2} style={{ margin: 0 }}>
            INTELLIGENT billing
          </Title>
          <Paragraph type="secondary" style={{ margin: 0 }}>
            Sign in with your community identity provider. This app never asks
            for or stores a password.
          </Paragraph>
          <Button
            type="primary"
            size="large"
            block
            loading={isPending}
            onClick={() => login({})}
          >
            Sign in with IdP
          </Button>
        </Space>
      </Card>
    </main>
  );
}
