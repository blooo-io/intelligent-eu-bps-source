import { useEffect, useState } from "react";
import { Alert, Button, Card, Input, List, Space, Typography } from "antd";
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

/**
 * Member history + periodic summary (INT-148 / REQ-031, REQ-032).
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

    if (loading) {
    return <PageFrame title="Reports" loading />;
  }

  return (
    <PageFrame title="Reports">
        {error && <Alert type="error" message={error} showIcon />}

        <Card title="Member history">
          <Paragraph type="secondary">
            Invoices and payments for one participant (REQ-031).
          </Paragraph>
          <Space direction="vertical" style={{ width: "100%" }}>
            <Input
              aria-label="Participant id"
              value={participantId}
              onChange={(e) => setParticipantId(e.target.value)}
              placeholder="Participant UUID"
            />
            <Button type="primary" loading={busy} onClick={onLoadHistory}>
              Load history
            </Button>
          </Space>
          {history && (
            <>
              <Paragraph style={{ marginTop: 16 }}>
                Participant <Text code>{history.participantId}</Text> ·{" "}
                {history.invoices.length} invoice(s) · {history.payments.length}{" "}
                payment(s)
              </Paragraph>
              <List
                header="Invoices"
                dataSource={history.invoices}
                locale={{ emptyText: "No invoices" }}
                renderItem={(inv) => (
                  <List.Item>
                    <Text code>{inv.invoiceId}</Text> · {inv.status} ·{" "}
                    {inv.amounts?.total} {inv.currency}
                  </List.Item>
                )}
              />
              <List
                header="Payments"
                dataSource={history.payments}
                locale={{ emptyText: "No payments" }}
                renderItem={(pay) => (
                  <List.Item>
                    <Text code>{pay.paymentId}</Text> · {pay.status} · {pay.amount}{" "}
                    {pay.currency}
                  </List.Item>
                )}
              />
            </>
          )}
        </Card>

        <Card title="Periodic summary">
          <Paragraph type="secondary">
            Community totals for one billing period (REQ-032)
            {communityId ? (
              <>
                {" "}
                · community <Text code>{communityId}</Text>
              </>
            ) : null}
            .
          </Paragraph>
          <Space direction="vertical" style={{ width: "100%" }}>
            <Input
              aria-label="Summary period"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              placeholder="2026-09"
            />
            <Button type="primary" loading={busy} onClick={onLoadSummary}>
              Load summary
            </Button>
          </Space>
          {summary && (
            <Paragraph style={{ marginTop: 16 }}>
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
    </PageFrame>
  );
}
