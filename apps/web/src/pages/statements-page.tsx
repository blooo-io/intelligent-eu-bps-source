import { useCallback, useEffect, useState } from "react";
import { Alert, Card, Table, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { WebConfig } from "../api/config";
import type { OidcFacade } from "../auth/oidc";
import { PageFrame } from "../layout/page-frame";
import { fetchMyStatements, type Statement } from "../api/statements";
import { userFacingMessage } from "../api/user-facing-error";

const { Paragraph, Text } = Typography;

function directionLabel(direction: Statement["direction"]): string {
  if (direction === "to_receive") return "to receive";
  if (direction === "to_pay") return "to pay";
  return "balanced";
}

function invoiceCountLabel(count: number): string {
  return count === 1 ? "1 invoice" : `${count} invoices`;
}

/**
 * Member billing statements (REQ-059 / UAT-076).
 * Totals bought/sold, net and direction for each period.
 */
export function StatementsPage({
  config,
  oidc,
}: Readonly<{
  config: WebConfig;
  oidc: OidcFacade;
}>) {
  const [statements, setStatements] = useState<Statement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const token = await oidc.getAccessToken();
    if (!token) throw new Error("No access token");
    return fetchMyStatements(config.apiBaseUrl, token);
  }, [config.apiBaseUrl, oidc]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await reload();
        if (!cancelled) setStatements(rows);
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

  const columns: ColumnsType<Statement> = [
    { title: "Period", dataIndex: "period", key: "period" },
    {
      title: "Bought",
      key: "bought",
      render: (_, row) => `${row.totalBought} ${row.currency}`,
    },
    {
      title: "Sold",
      key: "sold",
      render: (_, row) => `${row.totalSold} ${row.currency}`,
    },
    {
      title: "Net",
      key: "net",
      render: (_, row) => (
        <Text strong>
          {row.netBalance} {row.currency}
        </Text>
      ),
    },
    {
      title: "Direction",
      key: "direction",
      render: (_, row) => directionLabel(row.direction),
    },
    {
      title: "Invoices",
      key: "invoices",
      render: (_, row) => invoiceCountLabel(row.invoiceIds.length),
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (status: string) => <Text code>{status}</Text>,
    },
  ];

  if (loading) {
    return <PageFrame title="Statements" loading />;
  }

  return (
    <PageFrame
      title="Statements"
      description="Monthly billing statements — bought, sold, net and direction."
    >
      {error && <Alert type="error" message={error} showIcon />}

      <Card size="small">
        {statements.length === 0 ? (
          <Paragraph type="secondary" data-testid="statements-empty">
            No statements yet. They appear after a billing run invoices your
            period.
          </Paragraph>
        ) : (
          <Table
            size="small"
            rowKey="statementId"
            columns={columns}
            dataSource={statements}
            pagination={false}
          />
        )}
      </Card>
    </PageFrame>
  );
}
