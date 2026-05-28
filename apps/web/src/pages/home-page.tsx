import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, List, Space, Tag, Typography } from "antd";
import { CheckCircleOutlined, CloseCircleOutlined } from "@ant-design/icons";
import { useGetIdentity } from "@refinedev/core";
import { Link } from "react-router";
import { fetchMe, type Me } from "../api/me";
import type { WebConfig } from "../api/config";
import { userFacingMessage } from "../api/user-facing-error";
import type { OidcFacade } from "../auth/oidc";
import { PageFrame } from "../layout/page-frame";
import {
  homeAudience,
  homeDescription,
  homeNextAction,
  homeTitle,
} from "../layout/role-home";
import { brand } from "../theme";
import { readinessChecklist, readinessHeadline } from "../readiness/checklist";

const { Paragraph, Text } = Typography;

type Identity = {
  id?: string;
  name?: string;
  roles?: string[];
  communityId?: string;
};

/**
 * Home after IdP sign-in (INT-137 / INT-245).
 * Role-aware purpose + one next action; member readiness checklist only for members.
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

  const roles = identity?.roles ?? me?.roles ?? [];
  const audience = useMemo(() => homeAudience(roles), [roles]);

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
          setError(userFacingMessage(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [config.apiBaseUrl, oidc]);

  const next = homeNextAction(audience, me?.readiness);
  const displayName =
    me?.profile?.name?.trim() || identity?.name || "Signed in";

  return (
    <PageFrame
      title={homeTitle(audience)}
      description={homeDescription(audience)}
      loading={loading}
      actions={
        next ? (
          <Link to={next.to}>
            <Button type={next.primary ? "primary" : "default"}>{next.label}</Button>
          </Link>
        ) : undefined
      }
    >
      {error && <Alert type="error" message={error} showIcon />}

      <Card size="small" data-testid="home-who">
        <Space wrap size={[8, 8]}>
          <Text strong>{displayName}</Text>
          {roles.map((role) => (
            <Tag key={role} color="green">
              {role}
            </Tag>
          ))}
          {(identity?.communityId ?? me?.communityId) && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              Community{" "}
              <Text code style={{ fontSize: 11 }}>
                {identity?.communityId ?? me?.communityId}
              </Text>
            </Text>
          )}
        </Space>
        <Paragraph type="secondary" style={{ margin: "8px 0 0", fontSize: 13 }}>
          The header always shows who is signed in. Use the left menu for screens
          available to your role — manager and operator tools stay hidden from
          members.
        </Paragraph>
      </Card>

      {audience === "member" && me && (
        <Card
          title="Get ready"
          extra={
            me.readiness !== "Ready" ? (
              <Link to="/onboarding">
                <Button type="primary">Open wizard</Button>
              </Link>
            ) : (
              <Link to="/invoices">
                <Button type="primary">Pay invoices</Button>
              </Link>
            )
          }
        >
          <Paragraph>{readinessHeadline(me.readiness)}</Paragraph>
          <Paragraph type="secondary" style={{ marginBottom: 8 }}>
            Status <Text code>{me.readiness}</Text>
          </Paragraph>
          <List
            dataSource={readinessChecklist(me.readiness)}
            renderItem={(item) => (
              <List.Item>
                <Space>
                  {item.done ? (
                    <CheckCircleOutlined
                      style={{ color: brand.canopy }}
                      aria-label="done"
                    />
                  ) : (
                    <CloseCircleOutlined
                      style={{ color: "#c53d3d" }}
                      aria-label="todo"
                    />
                  )}
                  <Link to={item.to}>{item.label}</Link>
                </Space>
              </List.Item>
            )}
          />
        </Card>
      )}

      {audience === "manager" && (
        <Card title="Manager shortcuts">
          <List
            dataSource={[
              {
                to: "/community-settings",
                label: "Community settings — currency, period, threshold, VAT",
              },
              {
                to: "/participants",
                label: "Participants — invite and offboard members",
              },
              {
                to: "/billing-runs",
                label: "Billing runs — start periodic, early or final runs",
              },
              {
                to: "/payments-overview",
                label: "Payments overview — invoice payment status",
              },
            ]}
            renderItem={(item) => (
              <List.Item>
                <Link to={item.to}>{item.label}</Link>
              </List.Item>
            )}
          />
        </Card>
      )}

      {audience === "operator" && (
        <Card title="Operator focus">
          <Paragraph type="secondary" style={{ marginBottom: 0 }}>
            Open Operator for discrepancies, intake anomalies and job runs. This
            desk does not replace the member or manager portals.
          </Paragraph>
        </Card>
      )}
    </PageFrame>
  );
}
