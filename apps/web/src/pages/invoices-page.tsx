import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Card, Space, Table, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { WebConfig } from "../api/config";
import type { OidcFacade } from "../auth/oidc";
import { PageFrame } from "../layout/page-frame";
import {
  fetchInvoice,
  fetchInvoicePdfBlob,
  fetchMyInvoices,
  payInvoice,
  type Invoice,
  type Payment,
} from "../api/invoices";

const { Paragraph, Text } = Typography;

/**
 * Invoice list, detail, PDF and pay (INT-142 / REQ-007, REQ-014, REQ-039).
 * Compact table chrome (INT-188). PDF is fetched with bearer then opened;
 * payment goes to the producer (TD-6).
 */
export function InvoicesPage({
  config,
  oidc,
  embedded = false,
  openBlobUrl = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  },
}: {
  config: WebConfig;
  oidc: OidcFacade;
  /** Hide PageFrame when nested in the onboarding wizard (INT-211). */
  embedded?: boolean;
  openBlobUrl?: (url: string) => void;
}) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);

  const reload = useCallback(async () => {
    const token = await oidc.getAccessToken();
    if (!token) throw new Error("No access token");
    return fetchMyInvoices(config.apiBaseUrl, token);
  }, [config.apiBaseUrl, oidc]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await reload();
        if (!cancelled) setInvoices(rows);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load invoices");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  async function openDetail(invoiceId: string) {
    setBusy(true);
    setError(null);
    setPayment(null);
    try {
      const token = await oidc.getAccessToken();
      if (!token) throw new Error("No access token");
      setSelected(await fetchInvoice(config.apiBaseUrl, token, invoiceId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load invoice");
    } finally {
      setBusy(false);
    }
  }

  async function openPdf(invoiceId: string) {
    setBusy(true);
    setError(null);
    try {
      const token = await oidc.getAccessToken();
      if (!token) throw new Error("No access token");
      const blob = await fetchInvoicePdfBlob(config.apiBaseUrl, token, invoiceId);
      const url = URL.createObjectURL(blob);
      openBlobUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open PDF");
    } finally {
      setBusy(false);
    }
  }

  async function onPay(invoiceId: string) {
    setBusy(true);
    setError(null);
    setPayment(null);
    try {
      const token = await oidc.getAccessToken();
      if (!token) throw new Error("No access token");
      // REQ-014: payment to the producer's Stripe Connect account.
      const result = await payInvoice(config.apiBaseUrl, token, invoiceId);
      setPayment(result);
      setInvoices(await reload());
      setSelected(await fetchInvoice(config.apiBaseUrl, token, invoiceId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setBusy(false);
    }
  }

  const columns: ColumnsType<Invoice> = [
    {
      title: "Invoice",
      key: "invoice",
      render: (_, row) => row.legalNumber ?? row.invoiceId,
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (status: string) => <Text code>{status}</Text>,
    },
    {
      title: "Amount",
      key: "amount",
      render: (_, row) => `${row.amounts.total} ${row.currency}`,
    },
    {
      title: "",
      key: "actions",
      width: 88,
      render: (_, row) => (
        <Button size="small" onClick={() => openDetail(row.invoiceId)} loading={busy}>
          View
        </Button>
      ),
    },
  ];

  if (loading) {
    if (embedded) return null;
    return <PageFrame title="Invoices" loading />;
  }

  const body = (
    <>
      {error && <Alert type="error" message={error} showIcon />}
      {payment && (
        <Alert
          type="success"
          showIcon
          message={`Payment ${payment.paymentId}`}
          description={`Status: ${payment.status} · ${payment.amount} ${payment.currency}`}
        />
      )}

      <Card title="Your invoices" size="small">
        {invoices.length === 0 ? (
          <Paragraph type="secondary">No invoices yet.</Paragraph>
        ) : (
          <Table
            size="small"
            rowKey="invoiceId"
            columns={columns}
            dataSource={invoices}
            pagination={false}
          />
        )}
      </Card>

      {selected && (
        <Card
          size="small"
          title={`Invoice ${selected.legalNumber ?? selected.invoiceId}`}
          extra={<Text code>{selected.status}</Text>}
        >
          <Paragraph>
            Energy {selected.amounts.energy} · VAT {selected.amounts.vat} · Total{" "}
            <Text strong>
              {selected.amounts.total} {selected.currency}
            </Text>
          </Paragraph>
          <Paragraph type="secondary">
            Producer <Text code>{selected.producerId}</Text> · Consumer{" "}
            <Text code>{selected.consumerId}</Text>
          </Paragraph>
          {selected.tradeIds && selected.tradeIds.length > 0 && (
            <Paragraph>Trades: {selected.tradeIds.join(", ")}</Paragraph>
          )}
          <Paragraph type="secondary">
            No grid-fee lines on P2P invoices (A20 / REQ-007).
          </Paragraph>
          <Space>
            <Button size="small" onClick={() => openPdf(selected.invoiceId)} loading={busy}>
              Open PDF
            </Button>
            <Button
              type="primary"
              size="small"
              onClick={() => onPay(selected.invoiceId)}
              loading={busy}
              disabled={selected.status === "Paid"}
            >
              Pay
            </Button>
          </Space>
        </Card>
      )}
    </>
  );

  if (embedded) return body;
  return <PageFrame title="Invoices">{body}</PageFrame>;
}
