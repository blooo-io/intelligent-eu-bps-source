import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Card, List, Space, Spin, Typography } from "antd";
import { Link } from "react-router";
import type { WebConfig } from "../api/config";
import type { OidcFacade } from "../auth/oidc";
import {
  createEarlySettlement,
  fetchMyBalances,
  type Balance,
  type BillingRun,
} from "../api/balances";

const { Title, Paragraph, Text } = Typography;

/**
 * Unbilled balances + settle-now (INT-141 / REQ-057 / UAT-074 / BR-05).
 * Early settlement ignores the community threshold.
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
          setError(err instanceof Error ? err.message : "Failed to load balances");
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
      setError(err instanceof Error ? err.message : "Settlement failed");
    } finally {
      setSettlingId(null);
    }
  }

  if (loading) {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <Spin size="large" />
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 24,
        background: "linear-gradient(180deg, #f4faf7 0%, #ffffff 40%)",
      }}
    >
      <Space direction="vertical" size="large" style={{ width: "100%", maxWidth: 720 }}>
        <Space style={{ width: "100%", justifyContent: "space-between" }}>
          <Title level={2} style={{ margin: 0 }}>
            Balances
          </Title>
          <Link to="/">Back to home</Link>
        </Space>

        <Paragraph type="secondary">
          Unbilled amounts per counterpart. Settle now issues an invoice immediately
          (threshold does not apply — BR-05).
        </Paragraph>

        {error && <Alert type="error" message={error} showIcon />}
        {lastRun && (
          <Alert
            type="success"
            showIcon
            message={`Early settlement run ${lastRun.runId}`}
            description={`Status: ${lastRun.status} · type: ${lastRun.type}`}
          />
        )}

        <Card>
          {balances.length === 0 ? (
            <Paragraph type="secondary">No unbilled balances.</Paragraph>
          ) : (
            <List
              dataSource={balances}
              renderItem={(row) => (
                <List.Item
                  actions={[
                    <Button
                      key="settle"
                      type="primary"
                      loading={settlingId === row.counterpartId}
                      onClick={() => settleNow(row.counterpartId)}
                    >
                      Settle now
                    </Button>,
                  ]}
                >
                  <List.Item.Meta
                    title={
                      <span>
                        Counterpart <Text code>{row.counterpartId}</Text>
                      </span>
                    }
                    description={`${row.amount} ${row.currency}`}
                  />
                </List.Item>
              )}
            />
          )}
        </Card>
      </Space>
    </main>
  );
}
