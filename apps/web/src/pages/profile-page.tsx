import { useEffect, useState } from "react";
import { Alert, Button, Card, Form, Input, Typography } from "antd";
import { fetchMe, type BillingProfile, type Me } from "../api/me";
import { putMyProfile } from "../api/profile";
import type { WebConfig } from "../api/config";
import type { OidcFacade } from "../auth/oidc";
import { PageFrame } from "../layout/page-frame";

const { Paragraph, Text } = Typography;

/**
 * Participant billing profile screen (INT-138 / REQ-009 / UAT-009).
 * Editable: name, address, email. Read-only: participantId, communityId
 * (trade-attribution identifiers are manager-only).
 * `embedded` hides PageFrame when nested in the onboarding wizard (INT-211).
 */
export function ProfilePage({
  config,
  oidc,
  embedded = false,
}: {
  config: WebConfig;
  oidc: OidcFacade;
  embedded?: boolean;
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
    if (embedded) return null;
    return <PageFrame title="Billing profile" loading />;
  }

  const body = (
    <>
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
    </>
  );

  if (embedded) return body;
  return (
    <PageFrame
      title="Billing profile"
      description="Name, address and email used on invoices. Completing this moves you past the first readiness gate."
    >
      {body}
    </PageFrame>
  );
}
