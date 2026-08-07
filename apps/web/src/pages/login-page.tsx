import { Button, Card, Space, Typography } from "antd";
import { useLogin } from "@refinedev/core";
import { brand } from "../theme";

const { Title, Paragraph } = Typography;

/**
 * Sign-in screen (INT-137 / UAT-043 / INT-250).
 * Volt brand panel + IdP CTA — no password fields (REQ-033).
 */
export function LoginPage() {
  const { mutate: login, isPending } = useLogin();

  return (
    <main className="ge-login-split" data-testid="login-page">
      <aside className="ge-login-brand" aria-label="Brand">
        <Title level={2} style={{ margin: 0, color: brand.accent, fontSize: 28 }}>
          Intelligent Billing & Payment
        </Title>
        <Paragraph style={{ margin: 0, color: "#c5d6ce", maxWidth: 360 }}>
          Settle energy trades in your community — invoices in the producer&apos;s
          name, paid via Stripe.
        </Paragraph>
      </aside>
      <section className="ge-login-panel">
        <Card
          style={{ maxWidth: 400, width: "100%", borderRadius: 6 }}
          styles={{ body: { padding: 28 } }}
        >
          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            <div>
              <Title level={3} style={{ margin: 0 }}>
                Sign in
              </Title>
            </div>
            <Paragraph type="secondary" style={{ margin: 0 }}>
              Continue with your community identity. No password stored here.
            </Paragraph>
            <Button
              type="primary"
              size="large"
              block
              loading={isPending}
              onClick={() => login({})}
            >
              Continue with community IdP
            </Button>
          </Space>
        </Card>
      </section>
    </main>
  );
}
