import { useState } from "react";
import { Alert, Button, Card, Radio, Space, Typography } from "antd";
import { Link } from "react-router";
import type { WebConfig } from "../api/config";
import type { OidcFacade } from "../auth/oidc";
import {
  createDataSubjectRequest,
  getDataSubjectRequest,
  type DataSubjectRequest,
  type DataSubjectRequestType,
} from "../api/privacy";

const { Title, Paragraph, Text } = Typography;

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
  const [current, setCurrent] = useState<DataSubjectRequest | null>(null);

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
      setCurrent(
        await getDataSubjectRequest(config.apiBaseUrl, token, current.requestId),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh status");
    } finally {
      setRefreshing(false);
    }
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
            Privacy request
          </Title>
          <Link to="/">Back to home</Link>
        </Space>

        <Paragraph type="secondary">
          Request an export of your personal data or ask for erasure (REQ-013).
          Accounting records under legal retention are kept.
        </Paragraph>

        {error && <Alert type="error" message={error} showIcon />}

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
              Submit request
            </Button>
          </div>
        </Card>

        {current && (
          <Card
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
      </Space>
    </main>
  );
}
