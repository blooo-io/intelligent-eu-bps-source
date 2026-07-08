import { useEffect, useState } from "react";
import { Alert, Button, Card, Radio, Typography } from "antd";
import type { WebConfig } from "../api/config";
import type { OidcFacade } from "../auth/oidc";
import { PageFrame } from "../layout/page-frame";
import {
  createDataSubjectRequest,
  getDataSubjectRequest,
  type DataSubjectRequest,
  type DataSubjectRequestType,
} from "../api/privacy";

const { Paragraph, Text } = Typography;

/** INT-256 — survive shell remounts within the tab (auth revalidation races). */
const CURRENT_REQUEST_KEY = "int.privacy.currentRequest";

function readStoredRequest(): DataSubjectRequest | null {
  try {
    const raw = sessionStorage.getItem(CURRENT_REQUEST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DataSubjectRequest;
    if (!parsed?.requestId || !parsed?.type || !parsed?.status) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Privacy screen: export or erasure request (INT-143 / REQ-013 / UAT-013).
 * Member submits for themselves; status can be refreshed by request id.
 */
export function PrivacyPage({
  config,
  oidc,
}: {
  config: WebConfig;
  oidc: OidcFacade;
}) {
  const [requestType, setRequestType] = useState<DataSubjectRequestType>("export");
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<DataSubjectRequest | null>(() =>
    readStoredRequest(),
  );

  useEffect(() => {
    if (!current) return;
    try {
      sessionStorage.setItem(CURRENT_REQUEST_KEY, JSON.stringify(current));
    } catch {
      // Private mode / quota — status still shows for this mount.
    }
  }, [current]);

  async function onSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const token = await oidc.getAccessToken();
      if (!token) throw new Error("No access token");
      // REQ-013: portal export / erasure; invoices under legal retention stay.
      const result = await createDataSubjectRequest(config.apiBaseUrl, token, {
        type: requestType,
      });
      // Persist before setState so a remount mid-commit still restores (INT-256).
      try {
        sessionStorage.setItem(CURRENT_REQUEST_KEY, JSON.stringify(result));
      } catch {
        // ignore
      }
      setCurrent(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function onRefresh() {
    if (!current) return;
    setRefreshing(true);
    setError(null);
    try {
      const token = await oidc.getAccessToken();
      if (!token) throw new Error("No access token");
      const next = await getDataSubjectRequest(
        config.apiBaseUrl,
        token,
        current.requestId,
      );
      try {
        sessionStorage.setItem(CURRENT_REQUEST_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      setCurrent(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh status");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <PageFrame
      title="Privacy"
      description="Export or erase personal data held by billing."
    >
        {error && (
          <Alert data-testid="privacy-request-error" type="error" message={error} showIcon />
        )}

        <Card title="New request">
          <Radio.Group
            value={requestType}
            onChange={(e) => setRequestType(e.target.value)}
            style={{ marginBottom: 16 }}
          >
            <Radio.Button value="export">Export</Radio.Button>
            <Radio.Button value="erasure">Erasure</Radio.Button>
          </Radio.Group>
          <div>
            <Button type="primary" loading={submitting} onClick={onSubmit}>
              {requestType === "export" ? "Request export" : "Request erasure"}
            </Button>
          </div>
        </Card>

        {current && (
          <Card
            data-testid="privacy-request-status"
            title="Request status"
            extra={
              <Button onClick={onRefresh} loading={refreshing}>
                Refresh
              </Button>
            }
          >
            <Paragraph>
              Type <Text code>{current.type}</Text> · Status{" "}
              <Text code>{current.status}</Text>
            </Paragraph>
            <Paragraph type="secondary">
              Request <Text code>{current.requestId}</Text>
            </Paragraph>
            <Paragraph type="secondary">
              Participant <Text code>{current.participantId}</Text>
            </Paragraph>
          </Card>
        )}
    </PageFrame>
  );
}
