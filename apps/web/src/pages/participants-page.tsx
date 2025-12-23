import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  List,
  Select,
  Space,
  Spin,
  Typography,
} from "antd";
import { Link } from "react-router";
import { fetchMe } from "../api/me";
import {
  importParticipants,
  listParticipants,
  offboardParticipant,
  parseParticipantCsv,
  patchParticipant,
  type Participant,
  type ParticipantRole,
} from "../api/participants";
import type { WebConfig } from "../api/config";
import type { OidcFacade } from "../auth/oidc";

const { Title, Paragraph, Text } = Typography;

const ROLE_OPTIONS: { value: ParticipantRole; label: string }[] = [
  { value: "consumer", label: "Consumer" },
  { value: "producer", label: "Producer" },
  { value: "prosumer", label: "Prosumer" },
];

/**
 * Manager participant registry (INT-145 / REQ-008, REQ-012, REQ-058).
 * CSV import, list, patch attribution ids, offboard.
 */
export function ParticipantsPage({
  config,
  oidc,
}: {
  config: WebConfig;
  oidc: OidcFacade;
}) {
  const [communityId, setCommunityId] = useState<string | null>(null);
  const [rows, setRows] = useState<Participant[]>([]);
  const [selected, setSelected] = useState<Participant | null>(null);
  const [csvText, setCsvText] = useState(
    "email,marketActorId,meterId,role\n",
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [form] = Form.useForm<{
    marketActorId?: string;
    meterId?: string;
    role?: ParticipantRole;
  }>();

  const reload = useCallback(
    async (cid: string) => {
      const token = await oidc.getAccessToken();
      if (!token) throw new Error("No access token");
      return listParticipants(config.apiBaseUrl, token, cid);
    },
    [config.apiBaseUrl, oidc],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await oidc.getAccessToken();
        if (!token) throw new Error("No access token");
        const me = await fetchMe(config.apiBaseUrl, token);
        const list = await listParticipants(
          config.apiBaseUrl,
          token,
          me.communityId,
        );
        if (!cancelled) {
          setCommunityId(me.communityId);
          setRows(list);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load participants");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [config.apiBaseUrl, oidc]);

  async function onImport() {
    if (!communityId) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const parsed = parseParticipantCsv(csvText);
      const token = await oidc.getAccessToken();
      if (!token) throw new Error("No access token");
      // REQ-008: import creates participant + IdP invite (A21).
      await importParticipants(config.apiBaseUrl, token, communityId, parsed);
      setRows(await reload(communityId));
      setMessage(`Imported ${parsed.length} participant(s)`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  function openEdit(row: Participant) {
    setSelected(row);
    setMessage(null);
    form.setFieldsValue({
      marketActorId: row.marketActorId,
      meterId: row.meterId,
      role: row.role,
    });
  }

  async function onPatch(values: {
    marketActorId?: string;
    meterId?: string;
    role?: ParticipantRole;
  }) {
    if (!selected || !communityId) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const token = await oidc.getAccessToken();
      if (!token) throw new Error("No access token");
      // REQ-058 / REQ-009: manager-only attribution ids.
      const updated = await patchParticipant(
        config.apiBaseUrl,
        token,
        selected.participantId,
        values,
      );
      setSelected(updated);
      setRows(await reload(communityId));
      setMessage("Participant updated");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function onOffboard() {
    if (!selected || !communityId) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const token = await oidc.getAccessToken();
      if (!token) throw new Error("No access token");
      // REQ-012: offboard + final settlement event.
      const updated = await offboardParticipant(
        config.apiBaseUrl,
        token,
        selected.participantId,
      );
      setSelected(updated);
      setRows(await reload(communityId));
      setMessage("Participant offboarded");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Offboard failed");
    } finally {
      setBusy(false);
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
      <Space direction="vertical" size="large" style={{ width: "100%", maxWidth: 800 }}>
        <Space style={{ width: "100%", justifyContent: "space-between" }}>
          <Title level={2} style={{ margin: 0 }}>
            Participants
          </Title>
          <Link to="/">Back to home</Link>
        </Space>

        {error && <Alert type="error" message={error} showIcon />}
        {message && <Alert type="success" message={message} showIcon />}

        <Card title="Import (CSV)">
          <Paragraph type="secondary">
            Columns: email, marketActorId, meterId, role (consumer | producer |
            prosumer). Creates IdP accounts and invitations (REQ-008).
          </Paragraph>
          <Input.TextArea
            rows={5}
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            aria-label="Participant CSV"
          />
          <div style={{ marginTop: 12 }}>
            <Button type="primary" loading={busy} onClick={onImport}>
              Import
            </Button>
          </div>
        </Card>

        <Card title="Registry">
          {rows.length === 0 ? (
            <Paragraph type="secondary">No participants yet.</Paragraph>
          ) : (
            <List
              dataSource={rows}
              renderItem={(row) => (
                <List.Item
                  actions={[
                    <Button key="edit" onClick={() => openEdit(row)} loading={busy}>
                      Edit
                    </Button>,
                  ]}
                >
                  <List.Item.Meta
                    title={
                      <span>
                        <Text code>{row.participantId}</Text> · {row.role} ·{" "}
                        <Text code>{row.status}</Text>
                      </span>
                    }
                    description={`actor ${row.marketActorId ?? "—"} · meter ${row.meterId ?? "—"}`}
                  />
                </List.Item>
              )}
            />
          )}
        </Card>

        {selected && (
          <Card
            title="Edit attribution"
            extra={<Text code>{selected.status}</Text>}
          >
            <Paragraph type="secondary">
              Participant <Text code>{selected.participantId}</Text>
            </Paragraph>
            <Form form={form} layout="vertical" onFinish={onPatch}>
              <Form.Item label="Market actor id" name="marketActorId">
                <Input />
              </Form.Item>
              <Form.Item label="Meter id" name="meterId">
                <Input />
              </Form.Item>
              <Form.Item label="Role" name="role">
                <Select options={ROLE_OPTIONS} />
              </Form.Item>
              <Space>
                <Button type="primary" htmlType="submit" loading={busy}>
                  Save
                </Button>
                <Button
                  danger
                  loading={busy}
                  onClick={onOffboard}
                  disabled={selected.status === "Offboarded"}
                >
                  Offboard
                </Button>
              </Space>
            </Form>
          </Card>
        )}
      </Space>
    </main>
  );
}
