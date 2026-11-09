import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Card, Space, Table, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { WebConfig } from "../api/config";
import { fetchMe, type ParticipantRole } from "../api/me";
import type { OidcFacade } from "../auth/oidc";
import { PageFrame } from "../layout/page-frame";
import { isSellerRole } from "../layout/role-home";
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
 * Invoice list, detail, PDF and pay (INT-142 / INT-252 / REQ-007, REQ-014, REQ-039).
 * Compact table chrome (INT-188). PDF is fetched with bearer then opened;
 * payment goes to the producer (TD-6). Producer copy: issued invoices (self-billing).
 */
export function InvoicesPage({
  config,
  oidc,
  embedded = false,
  openBlobUrl = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  },
}: Readonly<{
  config: WebConfig;
  oidc: OidcFacade;
  /** Hide PageFrame when nested in the onboarding wizard (INT-211). */
  embedded?: boolean;
  openBlobUrl?: (url: string) => void;
}>) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [marketRole, setMarketRole] = useState<ParticipantRole | null>(null);
  // INT-269 — Pay when this participant is the invoice consumer (prosumer may buy).
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);
  const asProducer = isSellerRole(marketRole);
  const canPaySelected =
    Boolean(selected) &&
    Boolean(participantId) &&
    selected!.consumerId === participantId &&
    selected!.status !== "Paid";

  const reload = useCallback(async () => {
    const token = await oidc.getAccessToken();
    if (!token) throw new Error("No access token");
    return fetchMyInvoices(config.apiBaseUrl, token);
  }, [config.apiBaseUrl, oidc]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await oidc.getAccessToken();
        if (!token) throw new Error("No access token");
        const [rows, me] = await Promise.all([
          reload(),
          fetchMe(config.apiBaseUrl, token),
        ]);
        if (!cancelled) {
          setInvoices(rows);
          setMarketRole(me.role);
          setParticipantId(me.participantId);
        }
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
  }, [config.apiBaseUrl, oidc, reload]);

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

  const lineColumns: ColumnsType<NonNullable<Invoice["lines"]>[number]> = [
    {
      title: "Delivery",
      key: "delivery",
      render: (_value, line) =>
        line.deliveryStart && line.deliveryEnd
          ? `${line.deliveryStart} – ${line.deliveryEnd}`
          : "—",
    },
    { title: "kWh", dataIndex: "kWh", key: "kWh" },
    { title: "Price / kWh", dataIndex: "pricePerKWh", key: "price" },
    { title: "Amount", dataIndex: "amount", key: "amount" },
  ];

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

  const pageTitle = asProducer ? "Issued invoices" : "Invoices";
  const pageDescription = asProducer
    ? "Self-billing: PDFs show you as issuer. Energy + VAT only."
    : "Energy + VAT only. Grid fees are not on these invoices.";

  if (loading) {
    if (embedded) return null;
    return <PageFrame title={pageTitle} loading />;
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

      <Card title={asProducer ? "Issued to consumers" : "Your invoices"} size="small">
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
          {selected.lines && selected.lines.length > 0 && (
            <Table
              size="small"
              rowKey="tradeId"
              pagination={false}
              dataSource={selected.lines}
              columns={lineColumns}
              style={{ marginBottom: 12 }}
            />
          )}
          <Paragraph type="secondary">
            Peer-to-peer invoices do not include grid fees, taxes or levies.
          </Paragraph>
          <Space>
            <Button size="small" onClick={() => openPdf(selected.invoiceId)} loading={busy}>
              Open PDF
            </Button>
            {canPaySelected && (
              <Button
                type="primary"
                size="small"
                onClick={() => onPay(selected.invoiceId)}
                loading={busy}
              >
                Pay
              </Button>
            )}
          </Space>
        </Card>
      )}
    </>
  );

  if (embedded) return body;
  return (
    <PageFrame title={pageTitle} description={pageDescription}>
      {body}
    </PageFrame>
  );
}
