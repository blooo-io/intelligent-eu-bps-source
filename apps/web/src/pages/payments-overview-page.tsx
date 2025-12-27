import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  List,
  Radio,
  Space,
  Spin,
  Typography,
} from "antd";
import { Link } from "react-router";
import { fetchMe } from "../api/me";
import {
  fetchPaymentsOverview,
  setInvoiceStatus,
  type InvoiceStatus,
  type OverviewPayment,
} from "../api/payments-overview";
import type { WebConfig } from "../api/config";
import type { OidcFacade } from "../auth/oidc";

const { Title, Paragraph, Text } = Typography;

const STATUS_OPTIONS: InvoiceStatus[] = [
  "Draft",
  "Open",
  "PartiallyPaid",
  "Paid",
  "Overdue",
  "Void",
  "Disputed",
];

/**
 * Manager payments overview + manual invoice status (INT-147 / REQ-018, REQ-044).
 * Lists use the Stripe read cache (TD-6).
 */
export function PaymentsOverviewPage({
  config,
  oidc,
}: {
  config: WebConfig;
  oidc: OidcFacade;
}) {
  const [communityId, setCommunityId] = useState<string | null>(null);
  const [payments, setPayments] = useState<OverviewPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [form] = Form.useForm<{ status: InvoiceStatus; reason: string }>();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await oidc.getAccessToken();
        if (!token) throw new Error("No access token");
        const me = await fetchMe(config.apiBaseUrl, token);
        const rows = await fetchPaymentsOverview(
          config.apiBaseUrl,
          token,
          me.communityId,
        );
        if (!cancelled) {
          setCommunityId(me.communityId);
          setPayments(rows);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load overview");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [config.apiBaseUrl, oidc]);

  function openStatus(invoiceId: string) {
    setSelectedInvoiceId(invoiceId);
    setMessage(null);
    form.setFieldsValue({ status: "Paid", reason: "" });
  }

  async function onSetStatus(values: { status: InvoiceStatus; reason: string }) {
    if (!selectedInvoiceId) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const token = await oidc.getAccessToken();
      if (!token) throw new Error("No access token");
      // REQ-044: manager sets status with mandatory reason.
      const updated = await setInvoiceStatus(
        config.apiBaseUrl,
        token,
        selectedInvoiceId,
        { status: values.status, reason: values.reason.trim() },
      );
      setMessage(`Invoice ${updated.invoiceId} → ${updated.status}`);
      const reloadToken = await oidc.getAccessToken();
      if (reloadToken && communityId) {
        setPayments(
          await fetchPaymentsOverview(config.apiBaseUrl, reloadToken, communityId),
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Status update failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <Spin size="large" />
      </main>
    );
  }

  const succeeded = payments.filter((p) => p.status === "succeeded").length;
  const failed = payments.filter((p) => p.status === "failed").length;

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 24,
        background: "linear-gradient(180deg, #f4faf7 0%, #ffffff 40%)",
      }}
    >
      <Space direction="vertical" size="large" style={{ width: "100%", maxWidth: 800 }}>
        <Space style={{ width: "100%", justifyContent: "space-between" }}>
          <Title level={2} style={{ margin: 0 }}>
            Payments overview
          </Title>
          <Link to="/">Back to home</Link>
        </Space>

        {communityId && (
          <Paragraph type="secondary">
            Community <Text code>{communityId}</Text> · Stripe read cache (TD-6 / REQ-018)
          </Paragraph>
        )}

        {error && <Alert type="error" message={error} showIcon />}
        {message && <Alert type="success" message={message} showIcon />}

        <Card title="Summary">
          <Paragraph>
            {payments.length} payment(s) · succeeded <Text code>{succeeded}</Text> · failed{" "}
            <Text code>{failed}</Text>
          </Paragraph>
        </Card>

        <Card title="Payments">
          {payments.length === 0 ? (
            <Paragraph type="secondary">No payments yet.</Paragraph>
          ) : (
            <List
              dataSource={payments}
              renderItem={(row) => (
                <List.Item
                  actions={[
                    <Button
                      key="status"
                      onClick={() => openStatus(row.invoiceId)}
                      loading={busy}
                    >
                      Set invoice status
                    </Button>,
                  ]}
                >
                  <List.Item.Meta
                    title={
                      <span>
                        {row.amount} {row.currency} · <Text code>{row.status}</Text>
                      </span>
                    }
                    description={
                      <>
                        Payment <Text code>{row.paymentId}</Text> · invoice{" "}
                        <Text code>{row.invoiceId}</Text>
                        {row.failureCategory
                          ? ` · failure ${row.failureCategory}`
                          : ""}
                      </>
                    }
                  />
                </List.Item>
              )}
            />
          )}
        </Card>

        {selectedInvoiceId && (
          <Card title={`Manual status · ${selectedInvoiceId}`}>
            <Paragraph type="secondary">
              Reason is mandatory and audited (REQ-044 / UAT-055).
            </Paragraph>
            <Form form={form} layout="vertical" onFinish={onSetStatus}>
              <Form.Item
                label="Status"
                name="status"
                rules={[{ required: true, message: "Status is required" }]}
              >
                <Radio.Group>
                  {STATUS_OPTIONS.map((s) => (
                    <Radio.Button key={s} value={s}>
                      {s}
                    </Radio.Button>
                  ))}
                </Radio.Group>
              </Form.Item>
              <Form.Item
                label="Reason"
                name="reason"
                rules={[{ required: true, message: "Reason is required" }]}
              >
                <Input.TextArea rows={2} aria-label="Status reason" />
              </Form.Item>
              <Form.Item>
                <Button type="primary" htmlType="submit" loading={busy}>
                  Update status
                </Button>
              </Form.Item>
            </Form>
          </Card>
        )}
      </Space>
    </main>
  );
}
