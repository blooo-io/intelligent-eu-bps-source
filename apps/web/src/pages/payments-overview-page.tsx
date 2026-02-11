import { useEffect, useState } from "react";
import { Alert, Button, Card, Form, Input, Radio, Table, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { fetchMe } from "../api/me";
import {
  fetchPaymentsOverview,
  setInvoiceStatus,
  type InvoiceStatus,
  type OverviewPayment,
} from "../api/payments-overview";
import type { WebConfig } from "../api/config";
import type { OidcFacade } from "../auth/oidc";
import { PageFrame } from "../layout/page-frame";

const { Paragraph, Text } = Typography;

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
 * Dense table over the Stripe read cache (TD-6 / INT-188).
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

  const columns: ColumnsType<OverviewPayment> = [
    {
      title: "Amount",
      key: "amount",
      render: (_, row) => `${row.amount} ${row.currency}`,
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (status: string) => <Text code>{status}</Text>,
    },
    {
      title: "Payment",
      dataIndex: "paymentId",
      key: "paymentId",
      render: (id: string) => <Text code>{id}</Text>,
    },
    {
      title: "Invoice",
      dataIndex: "invoiceId",
      key: "invoiceId",
      render: (id: string) => <Text code>{id}</Text>,
    },
    {
      title: "Failure",
      dataIndex: "failureCategory",
      key: "failureCategory",
      render: (cat?: string) => (cat ? `failure ${cat}` : "—"),
    },
    {
      title: "",
      key: "actions",
      width: 148,
      render: (_, row) => (
        <Button
          size="small"
          onClick={() => openStatus(row.invoiceId)}
          loading={busy}
        >
          Set invoice status
        </Button>
      ),
    },
  ];

  if (loading) {
    return <PageFrame title="Payments overview" loading />;
  }

  const succeeded = payments.filter((p) => p.status === "succeeded").length;
  const failed = payments.filter((p) => p.status === "failed").length;

  return (
    <PageFrame title="Payments overview">
      {communityId && (
        <Paragraph type="secondary">
          Community <Text code>{communityId}</Text> · Stripe read cache (TD-6 / REQ-018)
        </Paragraph>
      )}

      {error && <Alert type="error" message={error} showIcon />}
      {message && <Alert type="success" message={message} showIcon />}

      <Card title="Summary" size="small">
        <Paragraph style={{ margin: 0 }}>
          {payments.length} payment(s) · succeeded <Text code>{succeeded}</Text> · failed{" "}
          <Text code>{failed}</Text>
        </Paragraph>
      </Card>

      <Card title="Payments" size="small">
        {payments.length === 0 ? (
          <Paragraph type="secondary">No payments yet.</Paragraph>
        ) : (
          <Table
            size="small"
            rowKey="paymentId"
            columns={columns}
            dataSource={payments}
            pagination={false}
            scroll={{ x: true }}
          />
        )}
      </Card>

      {selectedInvoiceId && (
        <Card title={`Manual status · ${selectedInvoiceId}`} size="small">
          <Paragraph type="secondary">
            Reason is mandatory and audited (REQ-044 / UAT-055).
          </Paragraph>
          <Form form={form} layout="vertical" onFinish={onSetStatus} size="small">
            <Form.Item
              label="Status"
              name="status"
              rules={[{ required: true, message: "Status is required" }]}
            >
              <Radio.Group optionType="button" size="small">
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
              <Button type="primary" htmlType="submit" loading={busy} size="small">
                Update status
              </Button>
            </Form.Item>
          </Form>
        </Card>
      )}
    </PageFrame>
  );
}
