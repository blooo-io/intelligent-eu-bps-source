import { useEffect, useState } from "react";
import { Alert, Button, Card, Checkbox, Typography } from "antd";
import type { WebConfig } from "../api/config";
import { fetchMe, type ParticipantRole } from "../api/me";
import type { OidcFacade } from "../auth/oidc";
import { isSellerRole } from "../layout/role-home";
import { PageFrame } from "../layout/page-frame";
import { acceptTerms, fetchCurrentTerms, type Terms, type TermsAcceptance } from "../api/terms";

const { Paragraph, Text } = Typography;

function termsAcceptanceDescription(acceptance: TermsAcceptance): string {
  const mandate = acceptance.selfBillingMandate ? "yes" : "no";
  if (acceptance.acceptedAt) {
    return `Recorded at ${acceptance.acceptedAt}. Self-billing mandate: ${mandate}.`;
  }
  return `Self-billing mandate: ${mandate}.`;
}

/**
 * Terms & self-billing mandate screen (INT-139 / REQ-050 / UAT-062 / INT-429).
 * Self-billing mandate only for producer/prosumer (REQ-050).
 * `embedded` hides PageFrame when nested in the onboarding wizard (INT-211).
 */
export function TermsPage({
  config,
  oidc,
  embedded = false,
  marketRole,
  onAccepted,
}: Readonly<{
  config: WebConfig;
  oidc: OidcFacade;
  embedded?: boolean;
  /** When known (wizard), skips an extra /me fetch for mandate visibility. */
  marketRole?: ParticipantRole | null;
  onAccepted?: () => void;
}>) {
  const [terms, setTerms] = useState<Terms | null>(null);
  const [role, setRole] = useState<ParticipantRole | null>(marketRole ?? null);
  const [mandate, setMandate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acceptance, setAcceptance] = useState<TermsAcceptance | null>(null);

  useEffect(() => {
    if (marketRole) setRole(marketRole);
  }, [marketRole]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await oidc.getAccessToken();
        if (!token) throw new Error("No access token");
        const [result, me] = await Promise.all([
          fetchCurrentTerms(config.apiBaseUrl, token),
          marketRole
            ? Promise.resolve(null)
            : fetchMe(config.apiBaseUrl, token).catch(() => null),
        ]);
        if (!cancelled) {
          setTerms(result);
          if (me) setRole(me.role);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load terms");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [config.apiBaseUrl, oidc, marketRole]);

  async function onAccept() {
    if (!terms) return;
    setSubmitting(true);
    setError(null);
    try {
      const token = await oidc.getAccessToken();
      if (!token) throw new Error("No access token");
      // REQ-050 — self-billing mandate only for producer/prosumer.
      const result = await acceptTerms(config.apiBaseUrl, token, {
        termsVersion: terms.termsVersion,
        selfBillingMandate: isSellerRole(role) ? mandate : false,
      });
      setAcceptance(result);
      onAccepted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Acceptance failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    if (embedded) return null;
    return <PageFrame title="Terms & conditions" loading />;
  }

  const showSelfBilling = isSellerRole(role);

  const body = (
    <>
      {error && <Alert type="error" message={error} showIcon />}

      {acceptance && (
        <Alert
          type="success"
          showIcon
          message={`Terms ${acceptance.termsVersion} accepted`}
          description={termsAcceptanceDescription(acceptance)}
        />
      )}

      {terms ? (
        <Card style={{ marginBottom: 16 }}>
          <Paragraph type="secondary">
            Version <Text code>{terms.termsVersion}</Text>
          </Paragraph>
          <Paragraph
            style={{
              whiteSpace: "pre-wrap",
              maxHeight: 320,
              overflow: "auto",
              border: "1px solid #f0f0f0",
              padding: 12,
              borderRadius: 6,
            }}
          >
            {terms.text}
          </Paragraph>
        </Card>
      ) : null}

      {terms && !acceptance && (
        <Card>
          {showSelfBilling ? (
            <Checkbox
              checked={mandate}
              onChange={(e) => setMandate(e.target.checked)}
              style={{ marginBottom: 16 }}
            >
              I accept the self-billing mandate (required for producers)
            </Checkbox>
          ) : null}
          <div>
            <Button type="primary" loading={submitting} onClick={onAccept}>
              Accept terms
            </Button>
          </div>
        </Card>
      )}
    </>
  );

  if (embedded) return body;
  return <PageFrame title="Terms & conditions">{body}</PageFrame>;
}
