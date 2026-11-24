import { useCallback, useEffect, useState } from "react";
import { Alert, Card, Table, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { WebConfig } from "../api/config";
import type { OidcFacade } from "../auth/oidc";
import { PageFrame } from "../layout/page-frame";
import { fetchMyBalances, type Balance } from "../api/balances";
import { userFacingMessage } from "../api/user-facing-error";

const { Paragraph, Text } = Typography;

/**
 * Unbilled balances (INT-141 / REQ-056).
 * Compact table chrome (INT-188). Amounts under the community threshold
 * carry forward until a periodic or final billing run invoices them.
 */
export function BalancesPage({
  config,
  oidc,
}: Readonly<{
  config: WebConfig;
  oidc: OidcFacade;
}>) {
  const [balances, setBalances] = useState<Balance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
  ];

  if (loading) {
    return <PageFrame title="Balances" loading />;
  }

  return (
    <PageFrame
      title="Balances"
      description="Net with each counterparty. Under threshold carries forward until the next billing run."
    >
      {error && <Alert type="error" message={error} showIcon />}

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
