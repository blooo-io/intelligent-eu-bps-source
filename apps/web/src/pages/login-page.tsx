import { Button, Card, Space, Typography } from "antd";
import { useLogin } from "@refinedev/core";

const { Title, Paragraph } = Typography;

/**
 * Sign-in screen (INT-137 / UAT-043 / INT-188).
 * Split brand panel (Gridline Energy) + IdP CTA — no password fields (REQ-033).
 */
export function LoginPage() {
  const { mutate: login, isPending } = useLogin();

  return (
    <main className="ge-login-split" data-testid="login-page">
      <aside className="ge-login-brand" aria-label="Brand">
        <span className="ge-brand-mark" aria-hidden>
          INT
        </span>
        <Title level={2} style={{ margin: 0, color: "#eef5f1", fontSize: 28 }}>
          INTELLIGENT billing
        </Title>
        <Paragraph style={{ margin: 0, color: "#c5d6ce", maxWidth: 360 }}>
          Producer-centric settlement for energy communities — netting, invoices
          and Stripe Connect in one place.
        </Paragraph>
      </aside>
      <section className="ge-login-panel">
        <Card
          style={{ maxWidth: 400, width: "100%", borderRadius: 8 }}
          styles={{ body: { padding: 28 } }}
        >
          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            <div>
              <Title level={3} style={{ margin: 0 }}>
                Sign in to billing
              </Title>
            </div>
            <Paragraph type="secondary" style={{ margin: 0 }}>
              Use your community identity provider (Keycloak). This app never asks
              for or stores a password. After sign-in you only see menus for your
              role — member, manager or operator.
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
      </section>
    </main>
  );
}
