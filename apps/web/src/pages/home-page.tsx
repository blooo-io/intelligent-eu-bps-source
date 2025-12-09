import { useEffect, useState } from "react";
import { Alert, Card, List, Space, Spin, Typography, Button } from "antd";
import { CheckCircleOutlined, CloseCircleOutlined } from "@ant-design/icons";
import { useGetIdentity, useLogout } from "@refinedev/core";
import { Link } from "react-router";
import { fetchMe, type Me } from "../api/me";
import type { WebConfig } from "../api/config";
import type { OidcFacade } from "../auth/oidc";
import { readinessChecklist, readinessHeadline } from "../readiness/checklist";

const { Title, Paragraph, Text } = Typography;

type Identity = {
  id?: string;
  name?: string;
  roles?: string[];
  communityId?: string;
};

/**
 * Home with readiness checklist after IdP sign-in (INT-137).
 * Loads GET /v1/me with the OIDC access token (REQ-049).
 */
export function HomePage({
  config,
  oidc,
}: {
  config: WebConfig;
  oidc: OidcFacade;
}) {
  const { data: identity } = useGetIdentity<Identity>();
  const { mutate: logout } = useLogout();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await oidc.getAccessToken();
        if (!token) {
          throw new Error("No access token");
        }
        const result = await fetchMe(config.apiBaseUrl, token);
        if (!cancelled) setMe(result);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load profile");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [config.apiBaseUrl, oidc]);

  if (loading) {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <Spin size="large" />
      </main>
    );
  }

  const items = me ? readinessChecklist(me.readiness) : [];

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
            INTELLIGENT billing
          </Title>
          <Space>
            <Link to="/profile">Profile</Link>
            <Button onClick={() => logout()}>Sign out</Button>
          </Space>
        </Space>

        {identity?.roles && identity.roles.length > 0 && (
          <Text type="secondary">
            Roles from IdP: {identity.roles.join(", ")}
            {identity.communityId ? ` · community ${identity.communityId}` : ""}
          </Text>
        )}

        {error && <Alert type="error" message={error} showIcon />}

        {me && (
          <Card title="Readiness">
            <Paragraph>{readinessHeadline(me.readiness)}</Paragraph>
            <Paragraph type="secondary">
              Status: <Text code>{me.readiness}</Text>
            </Paragraph>
            <List
              dataSource={items}
              renderItem={(item) => (
                <List.Item>
                  <Space>
                    {item.done ? (
                      <CheckCircleOutlined style={{ color: "#389e0d" }} aria-label="done" />
                    ) : (
                      <CloseCircleOutlined style={{ color: "#cf1322" }} aria-label="todo" />
                    )}
                    <span>{item.label}</span>
                  </Space>
                </List.Item>
              )}
            />
          </Card>
        )}
      </Space>
    </main>
  );
}
