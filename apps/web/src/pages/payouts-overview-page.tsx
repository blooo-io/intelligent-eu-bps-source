import { useEffect, useState } from "react";
import { Alert, Card, Table, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { fetchMe } from "../api/me";
import {
  fetchPayoutsOverview,
  type PayoutOverviewRow,
} from "../api/payouts-overview";
import type { WebConfig } from "../api/config";
import type { OidcFacade } from "../auth/oidc";
import { PageFrame } from "../layout/page-frame";
import { userFacingMessage } from "../api/user-facing-error";

const { Paragraph, Text } = Typography;

/**
 * Manager payout overview (REQ-060 / UAT-077).
 * One row per participant/period with expected amount and completed/open.
 */
export function PayoutsOverviewPage({
  config,
  oidc,
}: Readonly<{
  config: WebConfig;
  oidc: OidcFacade;
}>) {
  const [rows, setRows] = useState<PayoutOverviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await oidc.getAccessToken();
        if (!token) throw new Error("No access token");
        const me = await fetchMe(config.apiBaseUrl, token);
        const overview = await fetchPayoutsOverview(
          config.apiBaseUrl,
          token,
          me.communityId,
        );
        if (!cancelled) setRows(overview);
      } catch (err) {
        if (!cancelled) setError(userFacingMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [config.apiBaseUrl, oidc]);

  const columns: ColumnsType<PayoutOverviewRow> = [
    {
      title: "Participant",
      dataIndex: "participantId",
      key: "participantId",
      render: (id: string) => <Text code>{id}</Text>,
    },
    { title: "Period", dataIndex: "period", key: "period" },
    {
      title: "Expected",
      key: "expected",
      render: (_, row) => `${row.expectedAmount} ${row.currency}`,
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (status: string) => <Text code>{status}</Text>,
    },
    {
      title: "Paid out",
      key: "paidOut",
      render: (_, row) =>
        row.paidOutAmount != null
          ? `${row.paidOutAmount} ${row.currency}`
          : "—",
    },
  ];

  if (loading) {
    return <PageFrame title="Payouts overview" loading />;
  }

  return (
    <PageFrame
      title="Payouts overview"
      description="Expected and completed payouts per participant and period."
    >
      {error && <Alert type="error" message={error} showIcon />}

      <Card size="small">
        {rows.length === 0 ? (
          <Paragraph type="secondary">No payout overview rows yet.</Paragraph>
        ) : (
          <Table
            size="small"
            rowKey={(row) => `${row.participantId}-${row.period}`}
            columns={columns}
            dataSource={rows}
            pagination={false}
            scroll={{ x: true }}
          />
        )}
      </Card>
    </PageFrame>
  );
}
