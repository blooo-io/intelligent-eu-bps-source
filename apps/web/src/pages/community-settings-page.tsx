import { useEffect, useState } from "react";
import { Alert, Button, Card, Form, Input, Select, Typography } from "antd";
import { fetchMe } from "../api/me";
import {
  fetchCommunitySettings,
  putCommunitySettings,
  type BillingMode,
  type CommunitySettingsWrite,
} from "../api/community-settings";
import type { WebConfig } from "../api/config";
import { ApiError } from "../api/me";
import { userFacingMessage } from "../api/user-facing-error";
import type { OidcFacade } from "../auth/oidc";
import { AccessNotice } from "../layout/access-notice";
import { PageFrame } from "../layout/page-frame";

const { Paragraph, Text } = Typography;

type SettingsForm = CommunitySettingsWrite;

/**
 * Community billing settings (INT-144 / REQ-006, REQ-043, REQ-056).
 * Manager edits currency, period, threshold, VAT and mode (BR-12).
 */
export function CommunitySettingsPage({
  config,
  oidc,
}: {
  config: WebConfig;
  oidc: OidcFacade;
}) {
  const [communityId, setCommunityId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [saved, setSaved] = useState(false);
  const [form] = Form.useForm<SettingsForm>();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await oidc.getAccessToken();
        if (!token) throw new Error("No access token");
        const me = await fetchMe(config.apiBaseUrl, token);
        const settings = await fetchCommunitySettings(
          config.apiBaseUrl,
          token,
          me.communityId,
        );
        if (!cancelled) {
          setCommunityId(me.communityId);
          form.setFieldsValue({
            currency: settings.currency,
            billingPeriod: settings.billingPeriod,
            threshold: settings.threshold,
            vatRate: settings.vatRate,
            billingMode: settings.billingMode,
          });
        }
      } catch (err) {
        if (!cancelled) {
          if (err instanceof ApiError && err.status === 403) {
            setForbidden(true);
          } else {
            setError(userFacingMessage(err));
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [config.apiBaseUrl, oidc, form]);

  async function onFinish(values: SettingsForm) {
    if (!communityId) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const token = await oidc.getAccessToken();
      if (!token) throw new Error("No access token");
      // BR-12 / REQ-006: currency, period, threshold, VAT, mode.
      const updated = await putCommunitySettings(
        config.apiBaseUrl,
        token,
        communityId,
        {
          currency: values.currency,
          billingPeriod: values.billingPeriod,
          threshold: values.threshold,
          vatRate: values.vatRate,
          billingMode: values.billingMode,
        },
      );
      form.setFieldsValue({
        currency: updated.currency,
        billingPeriod: updated.billingPeriod,
        threshold: updated.threshold,
        vatRate: updated.vatRate,
        billingMode: updated.billingMode,
      });
      setSaved(true);
    } catch (err) {
      setError(userFacingMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <PageFrame title="Community settings" loading />;
  }

  return (
    <PageFrame
      title="Community settings"
      description="Manager-only. Set currency, billing period, invoice threshold, VAT and virtual/live mode for this energy community."
    >
        {forbidden && (
          <AccessNotice title="Community settings need a manager role" />
        )}
        {error && <Alert type="error" message={error} showIcon />}
        {saved && <Alert type="success" message="Settings saved" showIcon />}

        {communityId && !forbidden && (
          <Card>
            <Paragraph type="secondary">
              Community id (billing tenancy) <Text code>{communityId}</Text> — not a
              user id. Settings, participants, trades and runs are scoped to it.
            </Paragraph>
            <Paragraph type="secondary">
              Threshold carry-forward (REQ-056 / BR-05). V1 communities use virtual
              mode — Stripe test only (REQ-043).
            </Paragraph>
            <Form form={form} layout="vertical" onFinish={onFinish}>
              <Form.Item
                label="Currency"
                name="currency"
                rules={[
                  { required: true, message: "Currency is required" },
                  { pattern: /^[A-Z]{3}$/, message: "ISO 4217 code (e.g. EUR)" },
                ]}
              >
                <Input placeholder="EUR" maxLength={3} />
              </Form.Item>
              <Form.Item
                label="Billing period"
                name="billingPeriod"
                rules={[{ required: true, message: "Billing period is required" }]}
              >
                <Select
                  options={[
                    { value: "monthly", label: "Monthly" },
                    { value: "quarterly", label: "Quarterly" },
                  ]}
                />
              </Form.Item>
              <Form.Item
                label="Invoice threshold"
                name="threshold"
                rules={[
                  { required: true, message: "Threshold is required" },
                  {
                    pattern: /^-?\d+\.\d{2}$/,
                    message: "Amount with two decimals (e.g. 5.00)",
                  },
                ]}
              >
                <Input placeholder="5.00" />
              </Form.Item>
              <Form.Item
                label="VAT rate"
                name="vatRate"
                rules={[
                  { required: true, message: "VAT rate is required" },
                  {
                    pattern: /^\d+\.\d{2}$/,
                    message: "Rate with two decimals (e.g. 0.00)",
                  },
                ]}
              >
                <Input placeholder="0.00" />
              </Form.Item>
              <Form.Item
                label="Billing mode"
                name="billingMode"
                rules={[{ required: true, message: "Billing mode is required" }]}
              >
                <Select
                  options={[
                    { value: "virtual" as BillingMode, label: "Virtual (Stripe test)" },
                    { value: "live" as BillingMode, label: "Live" },
                  ]}
                />
              </Form.Item>
              <Form.Item>
                <Button type="primary" htmlType="submit" loading={saving}>
                  Save settings
                </Button>
              </Form.Item>
            </Form>
          </Card>
        )}
    </PageFrame>
  );
}
