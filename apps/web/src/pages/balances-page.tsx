import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Card, Table, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { WebConfig } from "../api/config";
import type { OidcFacade } from "../auth/oidc";
import { PageFrame } from "../layout/page-frame";
import {
  createEarlySettlement,
  fetchMyBalances,
  type Balance,
  type BillingRun,
} from "../api/balances";
import { userFacingMessage } from "../api/user-facing-error";

const { Paragraph, Text } = Typography;

/**
 * Unbilled balances + settle-now (INT-141 / REQ-057 / UAT-074 / BR-05).
 * Compact table chrome (INT-188). Early settlement ignores the community threshold.
 */
export function BalancesPage({
  config,
  oidc,
}: {
  config: WebConfig;
  oidc: OidcFacade;
}) {
  const [balances, setBalances] = useState<Balance[]>([]);
  const [loading, setLoading] = useState(true);
  const [settlingId, setSettlingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<BillingRun | null>(null);

  const reload = useCallback(async () => {
    const token = await oidc.getAccessToken();
    if (!token) throw new Error("No access token");
    return fetchMyBalances(config.apiBaseUrl, token);
  }, [config.apiBaseUrl, oidc]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await reload();
        if (!cancelled) setBalances(rows);
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
  }, [reload]);

  async function settleNow(producerId: string) {
    setSettlingId(producerId);
    setError(null);
    try {
      const token = await oidc.getAccessToken();
      if (!token) throw new Error("No access token");
      // BR-05: early settlement — threshold does not apply.
      const run = await createEarlySettlement(config.apiBaseUrl, token, producerId);
      setLastRun(run);
      setBalances(await reload());
    } catch (err) {
      setError(userFacingMessage(err));
    } finally {
      setSettlingId(null);
    }
  }

  const columns: ColumnsType<Balance> = [
    {
      title: "Counterpart",
      dataIndex: "counterpartId",
      key: "counterpartId",
      render: (id: string) => (
        <span>
          Counterpart <Text code>{id}</Text>
        </span>
      ),
    },
    {
      title: "Amount",
      key: "amount",
      render: (_, row) => `${row.amount} ${row.currency}`,
    },
    {
      title: "",
      key: "actions",
      width: 120,
      render: (_, row) => (
        <Button
          type="primary"
          size="small"
          loading={settlingId === row.counterpartId}
          onClick={() => settleNow(row.counterpartId)}
        >
          Settle now
        </Button>
      ),
    },
  ];

  if (loading) {
    return <PageFrame title="Balances" loading />;
  }

  return (
    <PageFrame
      title="Balances"
      description="Member view of unbilled amounts with each counterpart. Settle now creates an invoice immediately — the community threshold does not apply."
    >
      {error && <Alert type="error" message={error} showIcon />}
      {lastRun && (
        <Alert
          type="success"
          showIcon
          message={`Early settlement run ${lastRun.runId}`}
          description={`Status: ${lastRun.status} · type: ${lastRun.type}`}
        />
      )}

      <Card size="small">
        {balances.length === 0 ? (
          <Paragraph type="secondary" data-testid="balances-empty">
            No unbilled balances yet. After trades settle in a billing run, amounts
            appear here until they are invoiced.
          </Paragraph>
        ) : (
          <Table
            size="small"
            rowKey="counterpartId"
            columns={columns}
            dataSource={balances}
            pagination={false}
          />
        )}
      </Card>
    </PageFrame>
  );
}
