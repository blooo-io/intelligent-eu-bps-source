import { useEffect, useState } from "react";
import { Alert, Button, Card, Table, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { fetchMe } from "../api/me";
import {
  listDiscrepancies,
  listIntakeAnomalies,
  listJobs,
  runJob,
  type Discrepancy,
  type IntakeAnomaly,
  type Job,
} from "../api/operator";
import type { WebConfig } from "../api/config";
import type { OidcFacade } from "../auth/oidc";
import { PageFrame } from "../layout/page-frame";

const { Paragraph, Text } = Typography;

/**
 * Operator ops: anomalies, discrepancies, jobs (INT-149 / REQ-029, REQ-041).
 * Dense tabular layout (INT-188 Night Operator data density).
 */
export function OperatorPage({
  config,
  oidc,
}: {
  config: WebConfig;
  oidc: OidcFacade;
}) {
  const [anomalies, setAnomalies] = useState<IntakeAnomaly[]>([]);
  const [discrepancies, setDiscrepancies] = useState<Discrepancy[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await oidc.getAccessToken();
        if (!token) throw new Error("No access token");
        const me = await fetchMe(config.apiBaseUrl, token);
        const cid = me.communityId;
        const [a, d, j] = await Promise.all([
          listIntakeAnomalies(config.apiBaseUrl, token, cid),
          listDiscrepancies(config.apiBaseUrl, token, cid),
          listJobs(config.apiBaseUrl, token, cid),
        ]);
        if (!cancelled) {
          setAnomalies(a);
          setDiscrepancies(d);
          setJobs(j);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load ops");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [config.apiBaseUrl, oidc]);

  async function onRunJob(jobId: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const token = await oidc.getAccessToken();
      if (!token) throw new Error("No access token");
      const updated = await runJob(config.apiBaseUrl, token, jobId);
      setJobs((prev) =>
        prev.map((j) => (j.jobId === jobId ? { ...j, ...updated } : j)),
      );
      setMessage(`Job ${updated.name} → ${updated.outcome ?? "accepted"}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Run failed");
    } finally {
      setBusy(false);
    }
  }

  const anomalyColumns: ColumnsType<IntakeAnomaly> = [
    {
      title: "Type",
      dataIndex: "type",
      key: "type",
    },
    {
      title: "Market",
      dataIndex: "marketId",
      key: "marketId",
      render: (id: string) => <Text code>{id}</Text>,
    },
    {
      title: "Details",
      dataIndex: "details",
      key: "details",
      render: (details?: string) => details ?? "—",
    },
  ];

  const discrepancyColumns: ColumnsType<Discrepancy> = [
    {
      title: "Scope",
      dataIndex: "scope",
      key: "scope",
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (status?: string) => (status ? <Text code>{status}</Text> : "—"),
    },
    {
      title: "Expected / actual",
      key: "delta",
      render: (_, row) => `expected ${row.expected} · actual ${row.actual}`,
    },
  ];

  const jobColumns: ColumnsType<Job> = [
    {
      title: "Job",
      key: "name",
      render: (_, row) => (
        <span>
          {row.name} · <Text code>{row.jobId}</Text>
        </span>
      ),
    },
    {
      title: "Outcome",
      key: "outcome",
      render: (_, row) => (
        <>
          {row.outcome ? `Outcome ${row.outcome}` : "No outcome yet"}
          {row.lastRunAt ? ` · last ${row.lastRunAt}` : ""}
        </>
      ),
    },
    {
      title: "",
      key: "actions",
      width: 88,
      render: (_, row) => (
        <Button
          type="primary"
          size="small"
          loading={busy}
          onClick={() => onRunJob(row.jobId)}
        >
          Run
        </Button>
      ),
    },
  ];

  if (loading) {
    return <PageFrame title="Operator" loading />;
  }

  return (
    <PageFrame
      title="Operator"
      description="Operator-only. Review intake issues, reconciliation discrepancies and run scheduled work from the catalogue."
    >
      {error && <Alert type="error" message={error} showIcon />}
      {message && <Alert type="success" message={message} showIcon />}

      <Card title="Intake anomalies" size="small">
        {anomalies.length === 0 ? (
          <Paragraph type="secondary">No anomalies.</Paragraph>
        ) : (
          <Table
            size="small"
            rowKey={(row) => `${row.type}-${row.marketId}`}
            columns={anomalyColumns}
            dataSource={anomalies}
            pagination={false}
          />
        )}
      </Card>

      <Card title="Reconciliation discrepancies" size="small">
        {discrepancies.length === 0 ? (
          <Paragraph type="secondary">No discrepancies.</Paragraph>
        ) : (
          <Table
            size="small"
            rowKey={(row) => `${row.scope}-${row.expected}-${row.actual}`}
            columns={discrepancyColumns}
            dataSource={discrepancies}
            pagination={false}
          />
        )}
      </Card>

      <Card title="Jobs" size="small">
        {jobs.length === 0 ? (
          <Paragraph type="secondary">No jobs.</Paragraph>
        ) : (
          <Table
            size="small"
            rowKey="jobId"
            columns={jobColumns}
            dataSource={jobs}
            pagination={false}
          />
        )}
      </Card>
    </PageFrame>
  );
}
