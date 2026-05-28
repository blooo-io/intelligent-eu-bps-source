import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Card, Input, Radio, Space, Table, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
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
import { PageFrame } from "../layout/page-frame";

const { Paragraph, Text } = Typography;

/**
 * Manager participant registry (INT-145 / REQ-008, REQ-012, REQ-058).
 * CSV import, compact table, patch attribution ids, offboard (INT-188).
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
  const [editActorId, setEditActorId] = useState("");
  const [editMeterId, setEditMeterId] = useState("");
  const [editRole, setEditRole] = useState<ParticipantRole>("consumer");
  const [csvText, setCsvText] = useState(
    "email,marketActorId,meterId,role\n",
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

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
    setEditActorId(row.marketActorId ?? "");
    setEditMeterId(row.meterId ?? "");
    setEditRole(row.role);
  }

  async function onPatch() {
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
        {
          marketActorId: editActorId,
          meterId: editMeterId,
          role: editRole,
        },
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

  const columns: ColumnsType<Participant> = [
    {
      title: "Participant",
      dataIndex: "participantId",
      key: "participantId",
      render: (id: string) => <Text code>{id}</Text>,
    },
    {
      title: "Role",
      dataIndex: "role",
      key: "role",
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (status: string) => <Text code>{status}</Text>,
    },
    {
      title: "Attribution",
      key: "attribution",
      render: (_, row) =>
        `actor ${row.marketActorId ?? "—"} · meter ${row.meterId ?? "—"}`,
    },
    {
      title: "",
      key: "actions",
      width: 88,
      render: (_, row) => (
        <Button size="small" onClick={() => openEdit(row)} loading={busy}>
          Edit
        </Button>
      ),
    },
  ];

  if (loading) {
    return <PageFrame title="Participants" loading />;
  }

  return (
    <PageFrame
      title="Participants"
      description="Manager-only. Import members from CSV, adjust roles, or offboard someone from this community."
    >
      {error && <Alert type="error" message={error} showIcon />}
      {message && <Alert type="success" message={message} showIcon />}

      <Card title="Import (CSV)" size="small">
        <Paragraph type="secondary">
          Columns: email, marketActorId, meterId, role (consumer | producer |
          prosumer). Creates IdP accounts and invitations.
        </Paragraph>
        <Input.TextArea
          rows={4}
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
          aria-label="Participant CSV"
        />
        <div style={{ marginTop: 12 }}>
          <Button type="primary" size="small" loading={busy} onClick={onImport}>
            Import
          </Button>
        </div>
      </Card>

      <Card title="Registry" size="small">
        {rows.length === 0 ? (
          <Paragraph type="secondary">No participants yet.</Paragraph>
        ) : (
          <Table
            size="small"
            rowKey="participantId"
            columns={columns}
            dataSource={rows}
            pagination={false}
          />
        )}
      </Card>

      {selected && (
        <Card
          size="small"
          title="Edit attribution"
          extra={<Text code>{selected.status}</Text>}
        >
          <Paragraph type="secondary">
            Participant <Text code>{selected.participantId}</Text>
          </Paragraph>
          <Space direction="vertical" style={{ width: "100%" }} size="small">
            <Input
              aria-label="Market actor id"
              value={editActorId}
              onChange={(e) => setEditActorId(e.target.value)}
              placeholder="Market actor id"
            />
            <Input
              aria-label="Meter id"
              value={editMeterId}
              onChange={(e) => setEditMeterId(e.target.value)}
              placeholder="Meter id"
            />
            <Radio.Group
              value={editRole}
              onChange={(e) => setEditRole(e.target.value)}
              aria-label="Participant role"
              optionType="button"
              size="small"
            >
              <Radio.Button value="consumer">Consumer</Radio.Button>
              <Radio.Button value="producer">Producer</Radio.Button>
              <Radio.Button value="prosumer">Prosumer</Radio.Button>
            </Radio.Group>
            <Space>
              <Button type="primary" size="small" loading={busy} onClick={onPatch}>
                Save
              </Button>
              <Button
                danger
                size="small"
                loading={busy}
                onClick={onOffboard}
                disabled={selected.status === "Offboarded"}
              >
                Offboard
              </Button>
            </Space>
          </Space>
        </Card>
      )}
    </PageFrame>
  );
}
