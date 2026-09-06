import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Col, List, Row, Space, Statistic, Typography } from "antd";
import { CheckCircleOutlined, CloseCircleOutlined } from "@ant-design/icons";
import { useGetIdentity } from "@refinedev/core";
import { Link } from "react-router";
import { fetchMyBalances } from "../api/balances";
import { fetchMyInvoices } from "../api/invoices";
import { fetchMe, type Me } from "../api/me";
import type { WebConfig } from "../api/config";
import { userFacingMessage } from "../api/user-facing-error";
import type { OidcFacade } from "../auth/oidc";
import { PageFrame } from "../layout/page-frame";
import { communityDisplayName } from "../layout/community-label";
import { effectiveRoles } from "../layout/effective-roles";
import {
  homeAudience,
  homeDescription,
  homeNextAction,
  homeTitle,
  isSellerRole,
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

type Pulse = {
  openInvoices: number;
  balanceTotal: string | null;
  currency: string | null;
  counterparts: number;
};

function sumBalances(
  rows: Array<{ amount: string; currency: string }>,
): { total: string; currency: string | null; counterparts: number } {
  if (rows.length === 0) {
    return { total: "0.00", currency: null, counterparts: 0 };
  }
  const currency = rows[0]?.currency ?? null;
  let cents = 0;
  for (const row of rows) {
    const n = Number.parseFloat(row.amount);
    if (!Number.isFinite(n)) continue;
    cents += Math.round(n * 100);
  }
  return {
    total: (cents / 100).toFixed(2),
    currency,
    counterparts: rows.length,
  };
}

/**
 * Home after IdP sign-in (INT-137 / INT-245 / INT-250 / INT-252 / INT-255).
 * Money-first when Ready; consumer vs producer copy from market role.
 * Ready pulse: open invoices + unbilled balance totals.
 */
export function HomePage({
  config,
  oidc,
}: Readonly<{
  config: WebConfig;
  oidc: OidcFacade;
}>) {
  const { data: identity } = useGetIdentity<Identity>();
  const [me, setMe] = useState<Me | null>(null);
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const roles = effectiveRoles(identity?.roles, me?.roles);
  const audience = useMemo(() => homeAudience(roles), [roles]);
  const communityLabel = communityDisplayName(
    me?.communityId ?? identity?.communityId,
  );

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

        // INT-255 — Ready / manager pulse from existing money APIs.
        if (
          result.readiness === "Ready" ||
          result.roles.includes("manager")
        ) {
          try {
            const [invoices, balances] = await Promise.all([
              fetchMyInvoices(config.apiBaseUrl, token),
              fetchMyBalances(config.apiBaseUrl, token),
            ]);
            if (!cancelled) {
              const open = invoices.filter((i) =>
                ["Open", "Issued", "Pending", "open", "issued"].includes(
                  i.status,
                ),
              ).length;
              const bal = sumBalances(balances);
              setPulse({
                openInvoices: open,
                balanceTotal: bal.total,
                currency: bal.currency,
                counterparts: bal.counterparts,
              });
            }
          } catch {
            // Pulse is secondary; Home still works without it.
          }
        }
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

  const next = homeNextAction(audience, me?.readiness, me?.role);

  return (
    <PageFrame
      title={homeTitle(audience)}
      description={homeDescription(
        audience,
        me?.readiness,
        communityLabel,
        me?.role,
      )}
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

      {audience === "member" && me && me.readiness !== "Ready" && (
        <Card title="Get ready" data-testid="home-setup">
          <Paragraph>{readinessHeadline(me.readiness)}</Paragraph>
          <List
            dataSource={readinessChecklist(me.readiness)}
            renderItem={(item) => (
              <List.Item>
                <Space>
                  {item.done ? (
                    <CheckCircleOutlined
                      style={{ color: brand.ok }}
                      aria-label="done"
                    />
                  ) : (
                    <CloseCircleOutlined
                      style={{ color: brand.danger }}
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

      {audience === "member" && me?.readiness === "Ready" && (
        <Card
          title={isSellerRole(me.role) ? "Issued invoices" : "Next"}
          size="small"
          data-testid="home-money"
        >
          {pulse && (
            <Row gutter={24} style={{ marginBottom: 16 }} data-testid="home-pulse">
              <Col>
                <Statistic title="Open invoices" value={pulse.openInvoices} />
              </Col>
              <Col>
                <Statistic
                  title={isSellerRole(me.role) ? "Unbilled to collect" : "Unbilled balance"}
                  value={pulse.balanceTotal ?? "0.00"}
                  suffix={pulse.currency ?? undefined}
                />
              </Col>
            </Row>
          )}
          <Paragraph style={{ marginBottom: 0 }}>
            {isSellerRole(me.role) ? (
              <>
                Open invoices and balances are in the left menu. Use{" "}
                <Text strong>Review open invoices</Text> for amounts awaiting
                payment (self-billing PDFs show you as issuer).
              </>
            ) : (
              <>
                Open invoices and balances are in the left menu. Use{" "}
                <Text strong>Pay open invoices</Text> when you owe a counterparty.
              </>
            )}
          </Paragraph>
        </Card>
      )}

      {audience === "manager" && (
        <>
          {pulse && (
            <Card
              title="Pulse"
              size="small"
              style={{ marginBottom: 16 }}
              data-testid="home-pulse"
            >
              <Row gutter={24}>
                <Col>
                  <Statistic title="Open invoices" value={pulse.openInvoices} />
                </Col>
                <Col>
                  <Statistic
                    title="Unbilled pairs"
                    value={pulse.counterparts}
                  />
                </Col>
                <Col>
                  <Statistic
                    title="Unbilled total"
                    value={pulse.balanceTotal ?? "0.00"}
                    suffix={pulse.currency ?? undefined}
                  />
                </Col>
              </Row>
            </Card>
          )}
          <Card title="Manager shortcuts" size="small">
            <List
              dataSource={[
                {
                  to: "/community-settings",
                  label: "Settings — currency, period, threshold, VAT",
                },
                {
                  to: "/participants",
                  label: "Members — invite and offboard",
                },
                {
                  to: "/billing-runs",
                  label: "Billing runs — periodic, early or final",
                },
                {
                  to: "/payments-overview",
                  label: "Payments — invoice status across the community",
                },
              ]}
              renderItem={(item) => (
                <List.Item>
                  <Link to={item.to}>{item.label}</Link>
                </List.Item>
              )}
            />
          </Card>
        </>
      )}

      {audience === "operator" && (
        <Card title="Operator focus" size="small">
          <Paragraph type="secondary" style={{ marginBottom: 0 }}>
            Open Operator desk for discrepancies, intake anomalies and job runs.
            This desk does not replace the member or manager portals.
          </Paragraph>
        </Card>
      )}
    </PageFrame>
  );
}
