import { useEffect, useState } from "react";
import { Alert, Button, Card, List, Typography } from "antd";
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
 */
export function OperatorPage({
  config,
  oidc,
}: {
  config: WebConfig;
  oidc: OidcFacade;
}) {
  const [communityId, setCommunityId] = useState<string | null>(null);
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
          setCommunityId(cid);
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

    if (loading) {
    return <PageFrame title="Operator" loading />;
  }

  return (
    <PageFrame title="Operator">
        {communityId && (
          <Paragraph type="secondary">
            Scoped to community <Text code>{communityId}</Text>
          </Paragraph>
        )}

        {error && <Alert type="error" message={error} showIcon />}
        {message && <Alert type="success" message={message} showIcon />}

        <Card title="Intake anomalies">
          <Paragraph type="secondary">Trade-intake flags (REQ-029).</Paragraph>
          {anomalies.length === 0 ? (
            <Paragraph type="secondary">No anomalies.</Paragraph>
          ) : (
            <List
              dataSource={anomalies}
              renderItem={(row) => (
                <List.Item>
                  <List.Item.Meta
                    title={
                      <span>
                        {row.type} · market <Text code>{row.marketId}</Text>
                      </span>
                    }
                    description={row.details ?? "—"}
                  />
                </List.Item>
              )}
            />
          )}
        </Card>

        <Card title="Reconciliation discrepancies">
          <Paragraph type="secondary">Payment / market mismatches (REQ-041).</Paragraph>
          {discrepancies.length === 0 ? (
            <Paragraph type="secondary">No discrepancies.</Paragraph>
          ) : (
            <List
              dataSource={discrepancies}
              renderItem={(row) => (
                <List.Item>
                  <List.Item.Meta
                    title={
                      <span>
                        {row.scope}
                        {row.status ? (
                          <>
                            {" "}
                            · <Text code>{row.status}</Text>
                          </>
                        ) : null}
                      </span>
                    }
                    description={`expected ${row.expected} · actual ${row.actual}`}
                  />
                </List.Item>
              )}
            />
          )}
        </Card>

        <Card title="Jobs">
          <Paragraph type="secondary">Scheduled jobs — run now (02 §4.5).</Paragraph>
          {jobs.length === 0 ? (
            <Paragraph type="secondary">No jobs.</Paragraph>
          ) : (
            <List
              dataSource={jobs}
              renderItem={(row) => (
                <List.Item
                  actions={[
                    <Button
                      key="run"
                      type="primary"
                      loading={busy}
                      onClick={() => onRunJob(row.jobId)}
                    >
                      Run
                    </Button>,
                  ]}
                >
                  <List.Item.Meta
                    title={
                      <span>
                        {row.name} · <Text code>{row.jobId}</Text>
                      </span>
                    }
                    description={
                      <>
                        {row.outcome ? `Outcome ${row.outcome}` : "No outcome yet"}
                        {row.lastRunAt ? ` · last ${row.lastRunAt}` : ""}
                      </>
                    }
                  />
                </List.Item>
              )}
            />
          )}
        </Card>
    </PageFrame>
  );
}
