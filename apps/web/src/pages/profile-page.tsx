import { useEffect, useState } from "react";
import { Alert, Button, Card, Form, Input, Space, Spin, Typography } from "antd";
import { Link } from "react-router";
import { fetchMe, type BillingProfile, type Me } from "../api/me";
import { putMyProfile } from "../api/profile";
import type { WebConfig } from "../api/config";
import type { OidcFacade } from "../auth/oidc";

const { Title, Paragraph, Text } = Typography;

/**
 * Participant billing profile screen (INT-138 / REQ-009 / UAT-009).
 * Editable: name, address, email. Read-only: participantId, communityId
 * (trade-attribution identifiers are manager-only).
 */
export function ProfilePage({
  config,
  oidc,
}: {
  config: WebConfig;
  oidc: OidcFacade;
}) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [form] = Form.useForm<BillingProfile>();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await oidc.getAccessToken();
        if (!token) throw new Error("No access token");
        const result = await fetchMe(config.apiBaseUrl, token);
        if (!cancelled) {
          setMe(result);
          form.setFieldsValue(result.profile);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load profile");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [config.apiBaseUrl, oidc, form]);

  async function onFinish(values: BillingProfile) {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const token = await oidc.getAccessToken();
      if (!token) throw new Error("No access token");
      // REQ-009: only name / address / email — never send community or market ids.
      const updated = await putMyProfile(config.apiBaseUrl, token, {
        name: values.name,
        address: values.address,
        email: values.email,
      });
      setMe((prev) => (prev ? { ...prev, profile: updated } : prev));
      form.setFieldsValue(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <Spin size="large" />
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 24,
        background: "linear-gradient(180deg, #f4faf7 0%, #ffffff 40%)",
      }}
    >
      <Space direction="vertical" size="large" style={{ width: "100%", maxWidth: 640 }}>
        <Space style={{ width: "100%", justifyContent: "space-between" }}>
          <Title level={2} style={{ margin: 0 }}>
            Billing profile
          </Title>
          <Link to="/">Back to home</Link>
        </Space>

        {error && <Alert type="error" message={error} showIcon />}
        {saved && <Alert type="success" message="Profile saved" showIcon />}

        {me && (
          <Card>
            <Paragraph type="secondary">
              Participant <Text code>{me.participantId}</Text> · community{" "}
              <Text code>{me.communityId}</Text>
            </Paragraph>
            <Paragraph type="secondary">
              Community and trade-attribution identifiers can only be changed by a
              community manager (REQ-009).
            </Paragraph>
            <Form
              form={form}
              layout="vertical"
              onFinish={onFinish}
              initialValues={me.profile}
            >
              <Form.Item
                label="Name"
                name="name"
                rules={[{ required: true, message: "Name is required" }]}
              >
                <Input autoComplete="name" />
              </Form.Item>
              <Form.Item
                label="Address"
                name="address"
                rules={[{ required: true, message: "Address is required" }]}
              >
                <Input.TextArea rows={3} autoComplete="street-address" />
              </Form.Item>
              <Form.Item
                label="Contact e-mail"
                name="email"
                rules={[
                  { required: true, message: "E-mail is required" },
                  { type: "email", message: "Enter a valid e-mail" },
                ]}
              >
                <Input type="email" autoComplete="email" />
              </Form.Item>
              <Form.Item>
                <Button type="primary" htmlType="submit" loading={saving}>
                  Save profile
                </Button>
              </Form.Item>
            </Form>
          </Card>
        )}
      </Space>
    </main>
  );
}
