import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Space,
  Spin,
  Typography,
} from "antd";
import { Link } from "react-router";
import type { WebConfig } from "../api/config";
import type { OidcFacade } from "../auth/oidc";
import { acceptTerms, fetchCurrentTerms, type Terms, type TermsAcceptance } from "../api/terms";

const { Title, Paragraph, Text } = Typography;

/**
 * Terms & self-billing mandate screen (INT-139 / REQ-050 / UAT-062).
 * Producers must tick the self-billing mandate; the API rejects otherwise.
 */
export function TermsPage({
  config,
  oidc,
}: {
  config: WebConfig;
  oidc: OidcFacade;
}) {
  const [terms, setTerms] = useState<Terms | null>(null);
  const [mandate, setMandate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acceptance, setAcceptance] = useState<TermsAcceptance | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await oidc.getAccessToken();
        if (!token) throw new Error("No access token");
        const result = await fetchCurrentTerms(config.apiBaseUrl, token);
        if (!cancelled) setTerms(result);
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
  }, [config.apiBaseUrl, oidc]);

  async function onAccept() {
    if (!terms) return;
    setSubmitting(true);
    setError(null);
    try {
      const token = await oidc.getAccessToken();
      if (!token) throw new Error("No access token");
      const result = await acceptTerms(config.apiBaseUrl, token, {
        termsVersion: terms.termsVersion,
        selfBillingMandate: mandate,
      });
      setAcceptance(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Acceptance failed");
    } finally {
      setSubmitting(false);
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
      <Space direction="vertical" size="large" style={{ width: "100%", maxWidth: 720 }}>
        <Space style={{ width: "100%", justifyContent: "space-between" }}>
          <Title level={2} style={{ margin: 0 }}>
            Terms &amp; conditions
          </Title>
          <Link to="/">Back to home</Link>
        </Space>

        {error && <Alert type="error" message={error} showIcon />}

        {acceptance && (
          <Alert
            type="success"
            showIcon
            message={`Terms ${acceptance.termsVersion} accepted`}
            description={
              acceptance.acceptedAt
                ? `Recorded at ${acceptance.acceptedAt}. Self-billing mandate: ${
                    acceptance.selfBillingMandate ? "yes" : "no"
                  }.`
                : `Self-billing mandate: ${acceptance.selfBillingMandate ? "yes" : "no"}.`
            }
          />
        )}

        {terms && !acceptance && (
          <Card>
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
            <Checkbox
              checked={mandate}
              onChange={(e) => setMandate(e.target.checked)}
              style={{ marginBottom: 16 }}
            >
              I accept the self-billing mandate (required for producers — REQ-050)
            </Checkbox>
            <div>
              <Button type="primary" loading={submitting} onClick={onAccept}>
                Accept terms
              </Button>
            </div>
          </Card>
        )}
      </Space>
    </main>
  );
}
