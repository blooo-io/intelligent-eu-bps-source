import { useEffect, useState } from "react";
import { Alert, Button, Card, Form, Input, Radio, Typography } from "antd";
import { fetchMe } from "../api/me";
import {
  getBillingRun,
  startBillingRun,
  type BillingRun,
  type BillingRunType,
} from "../api/billing-runs";
import type { WebConfig } from "../api/config";
import { userFacingMessage } from "../api/user-facing-error";
import type { OidcFacade } from "../auth/oidc";
import { PageFrame } from "../layout/page-frame";

const { Paragraph, Text } = Typography;

type FormValues = {
  type: BillingRunType;
  period?: string;
};

/**
 * Billing runs screen (INT-146 / REQ-006 / UAT-006).
 * Manager starts a run and refreshes status.
 */
export function BillingRunsPage({
  config,
  oidc,
}: Readonly<{
  config: WebConfig;
  oidc: OidcFacade;
}>) {
  const [communityId, setCommunityId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<BillingRun | null>(null);
  const [form] = Form.useForm<FormValues>();
  const runType = Form.useWatch("type", form);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await oidc.getAccessToken();
        if (!token) throw new Error("No access token");
        const me = await fetchMe(config.apiBaseUrl, token);
        if (!cancelled) {
          setCommunityId(me.communityId);
          form.setFieldsValue({ type: "periodic", period: "" });
        }
      } catch (err) {
        if (!cancelled) {
          setError(userFacingMessage(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [config.apiBaseUrl, oidc, form]);

  async function onStart(values: FormValues) {
    if (!communityId) return;
    setBusy(true);
    setError(null);
    try {
      const token = await oidc.getAccessToken();
      if (!token) throw new Error("No access token");
      const body =
        values.type === "periodic"
          ? { type: values.type, period: values.period?.trim() || undefined }
          : { type: values.type };
      // REQ-006: manager triggers a billing run for the community period.
      const run = await startBillingRun(
        config.apiBaseUrl,
        token,
        communityId,
        body,
      );
      setCurrent(run);
    } catch (err) {
      setError(userFacingMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onRefresh() {
    if (!current) return;
    setBusy(true);
    setError(null);
    try {
      const token = await oidc.getAccessToken();
      if (!token) throw new Error("No access token");
      setCurrent(await getBillingRun(config.apiBaseUrl, token, current.runId));
    } catch (err) {
      setError(userFacingMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <PageFrame title="Billing runs" loading />;
  }

  return (
    <PageFrame
      title="Billing runs"
      description="Periodic, early or final settlement."
    >
        <Paragraph type="secondary" data-testid="billing-runs-community-help">
          Start a billing run for your energy community. Periodic runs cover a
          month (for example 2026-09); early and final runs settle open balances
          outside the normal calendar.
        </Paragraph>

        {error && <Alert type="error" message={error} showIcon />}

        <Card title="Start a run">
          <Form form={form} layout="vertical" onFinish={onStart}>
            <Form.Item
              label="Type"
              name="type"
              rules={[{ required: true, message: "Type is required" }]}
            >
              <Radio.Group>
                <Radio.Button value="periodic">Periodic</Radio.Button>
                <Radio.Button value="early">Early</Radio.Button>
                <Radio.Button value="final">Final</Radio.Button>
              </Radio.Group>
            </Form.Item>
            {runType === "periodic" && (
              <Form.Item
                label="Period"
                name="period"
                rules={[
                  { required: true, message: "Period is required for periodic runs" },
                  {
                    // REQ-006 — monthly (YYYY-MM) or quarterly (YYYY-Qn) period.
                    pattern: /^\d{4}-(0[1-9]|1[0-2]|Q[1-4])$/,
                    message: "Use YYYY-MM or YYYY-Qn, e.g. 2026-09 or 2026-Q3",
                  },
                ]}
              >
                <Input placeholder="2026-09 or 2026-Q3" aria-label="Billing period" />
              </Form.Item>
            )}
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={busy}>
                Start run
              </Button>
            </Form.Item>
          </Form>
        </Card>

        {current && (
          <Card
            title="Run status"
            extra={
              <Button onClick={onRefresh} loading={busy}>
                Refresh
              </Button>
            }
          >
            <Paragraph>
              Type <Text code>{current.type}</Text>
              {current.period ? (
                <>
                  {" "}
                  · Period <Text code>{current.period}</Text>
                </>
              ) : null}
            </Paragraph>
            <Paragraph>
              Status <Text code>{current.status}</Text> · version {current.version}
            </Paragraph>
            <Paragraph type="secondary">
              Run <Text code>{current.runId}</Text>
            </Paragraph>
          </Card>
        )}
    </PageFrame>
  );
}
