import { useEffect, useState } from "react";
import { Alert, Button, Card, List, Space, Typography } from "antd";
import { CheckCircleOutlined, CloseCircleOutlined } from "@ant-design/icons";
import { useGetIdentity } from "@refinedev/core";
import { Link } from "react-router";
import { fetchMe, type Me } from "../api/me";
import type { WebConfig } from "../api/config";
import type { OidcFacade } from "../auth/oidc";
import { PageFrame } from "../layout/page-frame";
import { readinessChecklist, readinessHeadline } from "../readiness/checklist";

const { Paragraph, Text } = Typography;

type Identity = {
  id?: string;
  name?: string;
  roles?: string[];
  communityId?: string;
};

/**
 * Home with readiness checklist after IdP sign-in (INT-137).
 * Loads GET /v1/me with the OIDC access token (REQ-049).
 * Navigation lives in AppShell (INT-187).
 */
export function HomePage({
  config,
  oidc,
}: {
  config: WebConfig;
  oidc: OidcFacade;
}) {
  const { data: identity } = useGetIdentity<Identity>();
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

  const roleLine =
    identity?.roles && identity.roles.length > 0
      ? `Roles from IdP: ${identity.roles.join(", ")}${
          identity.communityId ? ` · community ${identity.communityId}` : ""
        }`
      : undefined;

  return (
    <PageFrame title="Home" description={roleLine} loading={loading}>
      {error && <Alert type="error" message={error} showIcon />}

      {me && (
        <Card
          title="Readiness"
          extra={
            me.readiness !== "Ready" ? (
              <Link to="/onboarding">
                <Button type="primary">Continue wizard</Button>
              </Link>
            ) : (
              <Link to="/onboarding?step=pay">
                <Button>Pay invoices</Button>
              </Link>
            )
          }
        >
          <Paragraph>{readinessHeadline(me.readiness)}</Paragraph>
          <Paragraph type="secondary">
            Status: <Text code>{me.readiness}</Text>
          </Paragraph>
          <List
            dataSource={readinessChecklist(me.readiness)}
            renderItem={(item) => (
              <List.Item>
                <Space>
                  {item.done ? (
                    <CheckCircleOutlined style={{ color: "#3d8b6e" }} aria-label="done" />
                  ) : (
                    <CloseCircleOutlined style={{ color: "#c53d3d" }} aria-label="todo" />
                  )}
                  <Link to={item.to}>{item.label}</Link>
                </Space>
              </List.Item>
            )}
          />
        </Card>
      )}
    </PageFrame>
  );
}
