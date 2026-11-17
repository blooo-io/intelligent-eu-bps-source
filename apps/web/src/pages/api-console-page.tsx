import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Input, Select, Space, Typography } from "antd";
import { callPublicOperation } from "../api/call-public-operation";
import { fetchMe, type Me } from "../api/me";
import {
  buildOperationPath,
  operationById,
  PUBLIC_OPERATIONS,
  type PublicOperation,
} from "../api/public-operations";
import type { WebConfig } from "../api/config";
import type { OidcFacade } from "../auth/oidc";
import { PageFrame } from "../layout/page-frame";

const { Paragraph, Text } = Typography;

function prefill(
  operation: PublicOperation,
  me: Me | null,
): Record<string, string> {
  if (!me) return {};
  const values: Record<string, string> = {};
  for (const param of operation.params) {
    if (param.name === "communityId") values.communityId = me.communityId;
    if (param.name === "id" && operation.path.startsWith("/communities/")) {
      values.id = me.communityId;
    }
    if (param.name === "id" && operation.path.startsWith("/participants/")) {
      values.id = me.participantId;
    }
  }
  return values;
}

function bodyTextFor(operation: PublicOperation): string {
  if (operation.body === null) return "";
  return JSON.stringify(operation.body, null, 2);
}

/**
 * Manual caller for every public operation (REQ-052).
 * Persona screens stay; this page does not hide an operation by role.
 * A 403 from the API means the token is not allowed to call it.
 */
export function ApiConsolePage({
  config,
  oidc,
}: Readonly<{ config: WebConfig; oidc: OidcFacade }>) {
  const [me, setMe] = useState<Me | null>(null);
  const [operationId, setOperationId] = useState(PUBLIC_OPERATIONS[0]!.operationId);
  const operation = operationById(operationId) ?? PUBLIC_OPERATIONS[0]!;
  const [values, setValues] = useState<Record<string, string>>({});
  const [bodyText, setBodyText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const token = await oidc.getAccessToken();
        if (!token) return;
        const row = await fetchMe(config.apiBaseUrl, token);
        if (!cancelled) setMe(row);
      } catch {
        // The form still works; path ids stay empty until typed.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [config.apiBaseUrl, oidc]);

  useEffect(() => {
    setValues(prefill(operation, me));
    setBodyText(bodyTextFor(operation));
    setError(null);
    setResult(null);
    setDownloadUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
  }, [operation, me]);

  const groups = useMemo(() => {
    const byTag = new Map<string, PublicOperation[]>();
    for (const op of PUBLIC_OPERATIONS) {
      const list = byTag.get(op.tag) ?? [];
      list.push(op);
      byTag.set(op.tag, list);
    }
    return [...byTag.entries()].map(([tag, ops]) => ({
      label: tag,
      options: ops.map((op) => ({
        value: op.operationId,
        label: `${op.method} ${op.path}`,
      })),
    }));
  }, []);

  const built = buildOperationPath(operation, values);

  async function send() {
    setBusy(true);
    setError(null);
    setResult(null);
    setDownloadUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    try {
      const token = await oidc.getAccessToken();
      if (!token) {
        setError("No access token. Sign in again.");
        return;
      }
      const response = await callPublicOperation({
        apiBaseUrl: config.apiBaseUrl,
        accessToken: token,
        operation,
        values,
        bodyText,
      });
      if ("error" in response) {
        setError(response.error);
        return;
      }
      if (response.blob) {
        setDownloadUrl(URL.createObjectURL(response.blob));
      }
      setResult(`${response.status} ${response.contentType}\n${response.text}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Call failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageFrame
      title="API"
      description="Every public operation. The call uses your session token. A 403 means this role cannot call it."
    >
      <Paragraph type="secondary" style={{ marginTop: 0 }}>
        {PUBLIC_OPERATIONS.length} operations from the public contract. Fill the
        fields and send. The response is the API body, unchanged.
      </Paragraph>
      <Select
        data-testid="api-operation"
        showSearch
        style={{ width: "100%", maxWidth: 640, marginBottom: 16 }}
        value={operation.operationId}
        options={groups}
        onChange={setOperationId}
        optionFilterProp="label"
      />
      <Paragraph style={{ marginBottom: 8 }}>
        <Text strong>{operation.summary}</Text>
      </Paragraph>
      <Paragraph data-testid="api-url" style={{ fontFamily: "monospace" }}>
        {operation.method} {"path" in built ? built.path : built.error}
      </Paragraph>
      <Space orientation="vertical" style={{ width: "100%", maxWidth: 640 }} size={8}>
        {operation.params.map((param) => (
          <label key={`${param.in}-${param.name}`}>
            <Text>
              {param.in} {param.name}
              {param.required ? "" : " (optional)"}
            </Text>
            <Input
              aria-label={`${param.in} ${param.name}`}
              value={values[param.name] ?? ""}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  [param.name]: event.target.value,
                }))
              }
            />
          </label>
        ))}
        {operation.body !== null ? (
          <label>
            <Text>JSON body</Text>
            <Input.TextArea
              aria-label="JSON body"
              rows={12}
              value={bodyText}
              onChange={(event) => setBodyText(event.target.value)}
              style={{ fontFamily: "monospace" }}
            />
          </label>
        ) : null}
        <Button type="primary" onClick={() => void send()} loading={busy}>
          Send
        </Button>
      </Space>
      {error ? (
        <Alert type="error" showIcon title={error} style={{ marginTop: 16 }} />
      ) : null}
      {result ? (
        <pre data-testid="api-response" style={{ marginTop: 16, whiteSpace: "pre-wrap" }}>
          {result}
        </pre>
      ) : null}
      {downloadUrl ? (
        <Paragraph>
          <a href={downloadUrl} download="response.bin">
            Download response
          </a>
        </Paragraph>
      ) : null}
    </PageFrame>
  );
}
