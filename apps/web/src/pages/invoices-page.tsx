import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Card, List, Space, Typography } from "antd";
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
 * PDF is fetched with bearer then opened; payment goes to the producer (TD-6).
 */
export function InvoicesPage({
  config,
  oidc,
  openBlobUrl = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  },
}: {
  config: WebConfig;
  oidc: OidcFacade;
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

    if (loading) {
    return <PageFrame title="Invoices" loading />;
  }

  return (
    <PageFrame title="Invoices">
        {error && <Alert type="error" message={error} showIcon />}
        {payment && (
          <Alert
            type="success"
            showIcon
            message={`Payment ${payment.paymentId}`}
            description={`Status: ${payment.status} · ${payment.amount} ${payment.currency}`}
          />
        )}

        <Card title="Your invoices">
          {invoices.length === 0 ? (
            <Paragraph type="secondary">No invoices yet.</Paragraph>
          ) : (
            <List
              dataSource={invoices}
              renderItem={(row) => (
                <List.Item
                  actions={[
                    <Button key="view" onClick={() => openDetail(row.invoiceId)} loading={busy}>
                      View
                    </Button>,
                  ]}
                >
                  <List.Item.Meta
                    title={
                      <span>
                        {row.legalNumber ?? row.invoiceId} · <Text code>{row.status}</Text>
                      </span>
                    }
                    description={`${row.amounts.total} ${row.currency}`}
                  />
                </List.Item>
              )}
            />
          )}
        </Card>

        {selected && (
          <Card
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
              <Paragraph>
                Trades: {selected.tradeIds.join(", ")}
              </Paragraph>
            )}
            <Paragraph type="secondary">
              No grid-fee lines on P2P invoices (A20 / REQ-007).
            </Paragraph>
            <Space>
              <Button onClick={() => openPdf(selected.invoiceId)} loading={busy}>
                Open PDF
              </Button>
              <Button
                type="primary"
                onClick={() => onPay(selected.invoiceId)}
                loading={busy}
                disabled={selected.status === "Paid"}
              >
                Pay
              </Button>
            </Space>
          </Card>
        )}
    </PageFrame>
  );
}
