import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Card, Space, Table, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { WebConfig } from "../api/config";
import { ApiError } from "../api/me";
import type { OidcFacade } from "../auth/oidc";
import { PageFrame } from "../layout/page-frame";
import {
  fetchMyPayouts,
  requestWithdrawal,
  type Payout,
  type WithdrawablePeriod,
} from "../api/payouts";
import { userFacingMessage } from "../api/user-facing-error";

const { Paragraph, Text } = Typography;

function statusLabel(status: string): string {
  return status.replaceAll("_", " ");
}

/** Map PayoutRefused reasons to actionable copy (REQ-015 / REQ-060). */
export function payoutRefusalMessage(err: unknown): string {
  if (err instanceof ApiError && err.reason) {
    switch (err.reason) {
      case "producer_invoices_unpaid":
        return "Some of your buyers have not paid yet. Wait until those invoices are settled, then try again.";
      case "kyc_required":
        return "Complete payout-account verification before withdrawing.";
      case "statement_not_found":
        return "No statement was found for that period.";
      case "nothing_to_pay_out":
        return "There is nothing to pay out for that period.";
      case "funds_pending":
        return "Funds are not yet available on your payout account. Try again later.";
      default:
        break;
    }
  }
  return userFacingMessage(err);
}

/**
 * Producer payouts and withdrawals (REQ-015 / UAT-015 / REQ-060).
 * Lists history and withdrawable periods; Withdraw posts { period }.
 */
export function PayoutsPage({
  config,
  oidc,
}: Readonly<{
  config: WebConfig;
  oidc: OidcFacade;
}>) {
  const [items, setItems] = useState<Payout[]>([]);
  const [withdrawable, setWithdrawable] = useState<WithdrawablePeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastPayout, setLastPayout] = useState<Payout | null>(null);

  const reload = useCallback(async () => {
    const token = await oidc.getAccessToken();
    if (!token) throw new Error("No access token");
    return fetchMyPayouts(config.apiBaseUrl, token);
  }, [config.apiBaseUrl, oidc]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await reload();
        if (!cancelled) {
          setItems(list.items);
          setWithdrawable(list.withdrawable);
        }
      } catch (err) {
        if (!cancelled) setError(userFacingMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  async function onWithdraw(period: string) {
    setBusy(true);
    setError(null);
    setLastPayout(null);
    try {
      const token = await oidc.getAccessToken();
      if (!token) throw new Error("No access token");
      // REQ-015: participant-triggered Connect payout for one period.
      const payout = await requestWithdrawal(config.apiBaseUrl, token, period);
      setLastPayout(payout);
      const list = await reload();
      setItems(list.items);
      setWithdrawable(list.withdrawable);
    } catch (err) {
      setError(payoutRefusalMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const historyColumns: ColumnsType<Payout> = [
    { title: "Period", dataIndex: "period", key: "period" },
    {
      title: "Amount",
      key: "amount",
      render: (_, row) => `${row.amount} ${row.currency}`,
    },
    {
      title: "Status",
      key: "status",
      render: (_, row) => <Text code>{statusLabel(row.status)}</Text>,
    },
    {
      title: "Trigger",
      dataIndex: "trigger",
      key: "trigger",
    },
  ];

  if (loading) {
    return <PageFrame title="Payouts" loading />;
  }

  return (
    <PageFrame
      title="Payouts"
      description="Withdraw settled sales to your payout account, or review past payouts."
    >
      {error && <Alert type="error" message={error} showIcon />}
      {lastPayout && (
        <Alert
          type="success"
          showIcon
          message={`Payout ${lastPayout.payoutId}`}
          description={`${lastPayout.amount} ${lastPayout.currency} · period ${lastPayout.period}`}
        />
      )}

      <Card title="Available to withdraw" size="small">
        {withdrawable.length === 0 ? (
          <Paragraph type="secondary">
            No periods ready to withdraw. Paid producer invoices appear here once
            the statement is settled.
          </Paragraph>
        ) : (
          <Space direction="vertical" size="small" style={{ width: "100%" }}>
            {withdrawable.map((row) => (
              <Space key={row.period} wrap>
                <Text>
                  Period <Text code>{row.period}</Text> — {row.amount}{" "}
                  {row.currency}
                </Text>
                <Button
                  type="primary"
                  size="small"
                  loading={busy}
                  onClick={() => onWithdraw(row.period)}
                >
                  {`Withdraw ${row.amount} ${row.currency}`}
                </Button>
              </Space>
            ))}
          </Space>
        )}
      </Card>

      <Card title="Payout history" size="small">
        {items.length === 0 ? (
          <Paragraph type="secondary">No payouts yet.</Paragraph>
        ) : (
          <Table
            size="small"
            rowKey="payoutId"
            columns={historyColumns}
            dataSource={items}
            pagination={false}
          />
        )}
      </Card>
    </PageFrame>
  );
}
