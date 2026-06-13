import { useEffect, useState } from "react";
import { Alert, Button, Card, Input, Space, Table, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { fetchMe } from "../api/me";
import {
  fetchParticipantHistory,
  fetchPeriodicSummary,
  type MemberHistory,
  type PeriodicSummary,
} from "../api/reports";
import type { WebConfig } from "../api/config";
import type { OidcFacade } from "../auth/oidc";
import { PageFrame } from "../layout/page-frame";

const { Paragraph, Text } = Typography;

type HistoryInvoice = MemberHistory["invoices"][number];
type HistoryPayment = MemberHistory["payments"][number];

/**
 * Member history + periodic summary (INT-148 / INT-252 / REQ-031, REQ-032).
 * Volt: members see "My history"; managers see "Community reports".
 */
export function ReportsPage({
  config,
  oidc,
}: {
  config: WebConfig;
  oidc: OidcFacade;
}) {
  const [communityId, setCommunityId] = useState<string | null>(null);
  const [participantId, setParticipantId] = useState("");
  const [period, setPeriod] = useState("");
  const [asManager, setAsManager] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<MemberHistory | null>(null);
  const [summary, setSummary] = useState<PeriodicSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await oidc.getAccessToken();
        if (!token) throw new Error("No access token");
        const me = await fetchMe(config.apiBaseUrl, token);
        if (!cancelled) {
          setCommunityId(me.communityId);
          setParticipantId(me.participantId);
          setAsManager(me.roles.includes("manager"));
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [config.apiBaseUrl, oidc]);

  async function onLoadHistory() {
    setBusy(true);
    setError(null);
    try {
      const token = await oidc.getAccessToken();
      if (!token) throw new Error("No access token");
      // REQ-031: manager / member history of invoices and payments.
      setHistory(
        await fetchParticipantHistory(
          config.apiBaseUrl,
          token,
          participantId.trim(),
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "History failed");
    } finally {
      setBusy(false);
    }
  }

  async function onLoadSummary() {
    if (!communityId) return;
    setBusy(true);
    setError(null);
    try {
      const token = await oidc.getAccessToken();
      if (!token) throw new Error("No access token");
      // REQ-032: periodic community summary.
      setSummary(
        await fetchPeriodicSummary(
          config.apiBaseUrl,
          token,
          communityId,
          period.trim(),
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Summary failed");
    } finally {
      setBusy(false);
    }
  }

  const invoiceColumns: ColumnsType<HistoryInvoice> = [
    {
      title: "Invoice",
      dataIndex: "invoiceId",
      key: "invoiceId",
      render: (id: string) => <Text code>{id}</Text>,
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
    },
    {
      title: "Amount",
      key: "amount",
      render: (_, inv) => `${inv.amounts?.total ?? ""} ${inv.currency ?? ""}`.trim(),
    },
  ];

  const paymentColumns: ColumnsType<HistoryPayment> = [
    {
      title: "Payment",
      dataIndex: "paymentId",
      key: "paymentId",
      render: (id: string) => <Text code>{id}</Text>,
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
    },
    {
      title: "Amount",
      key: "amount",
      render: (_, pay) => `${pay.amount} ${pay.currency}`,
    },
  ];

  const pageTitle = asManager ? "Community reports" : "My history";
  const pageDescription = asManager
    ? "Period summary for the whole community."
    : "Your bought / sold energy and net €.";

  if (loading) {
    return <PageFrame title={pageTitle} loading />;
  }

  return (
    <PageFrame title={pageTitle} description={pageDescription}>
      {error && <Alert type="error" message={error} showIcon />}

      <Card title={asManager ? "Member history" : "Your history"} size="small">
        <Paragraph type="secondary">
          {asManager
            ? "Invoices and payments for one participant."
            : "Invoices and payments for your account."}
        </Paragraph>
        <Space direction="vertical" style={{ width: "100%" }} size="small">
          {asManager && (
            <Input
              aria-label="Participant id"
              value={participantId}
              onChange={(e) => setParticipantId(e.target.value)}
              placeholder="Participant UUID"
            />
          )}
          <Button type="primary" size="small" loading={busy} onClick={onLoadHistory}>
            Load
          </Button>
        </Space>
        {history && (
          <>
            <Paragraph style={{ marginTop: 12 }}>
              Participant <Text code>{history.participantId}</Text> ·{" "}
              {history.invoices.length} invoice(s) · {history.payments.length}{" "}
              payment(s)
            </Paragraph>
            <Paragraph type="secondary" style={{ marginBottom: 4 }}>
              Invoices
            </Paragraph>
            <Table
              size="small"
              rowKey="invoiceId"
              columns={invoiceColumns}
              dataSource={history.invoices}
              pagination={false}
              locale={{ emptyText: "No invoices" }}
              style={{ marginBottom: 12 }}
            />
            <Paragraph type="secondary" style={{ marginBottom: 4 }}>
              Payments
            </Paragraph>
            <Table
              size="small"
              rowKey="paymentId"
              columns={paymentColumns}
              dataSource={history.payments}
              pagination={false}
              locale={{ emptyText: "No payments" }}
            />
          </>
        )}
      </Card>

      {asManager && (
        <Card title="Periodic summary" size="small">
          <Paragraph type="secondary">
            Community totals for one billing period.
          </Paragraph>
          <Space direction="vertical" style={{ width: "100%" }} size="small">
            <Input
              aria-label="Summary period"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              placeholder="2026-09"
            />
            <Button type="primary" size="small" loading={busy} onClick={onLoadSummary}>
              Load summary
            </Button>
          </Space>
          {summary && (
            <Paragraph style={{ marginTop: 12 }}>
              Period <Text code>{summary.period}</Text> · invoices{" "}
              <Text code>{summary.invoiceCount}</Text> · payments{" "}
              <Text code>{summary.paymentCount}</Text> · total{" "}
              <Text strong>
                {summary.total}
                {summary.currency ? ` ${summary.currency}` : ""}
              </Text>
            </Paragraph>
          )}
        </Card>
      )}
    </PageFrame>
  );
}
