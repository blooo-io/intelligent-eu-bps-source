import { useState } from "react";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Form,
  Input,
  Select,
  Typography,
} from "antd";
import type { WebConfig } from "../api/config";
import type { OidcFacade } from "../auth/oidc";
import {
  createPaymentOnboarding,
  submitPaymentOnboardingRequirements,
  type OnboardingSession,
} from "../api/payment";
import { PageFrame } from "../layout/page-frame";

const { Paragraph, Text } = Typography;

/**
 * Payment setup (INT-140 / INT-190 / REQ-051 / UAT-051 / UAT-063).
 * Producer: in-platform Connect KYC form (Accounts API).
 * Consumer: redirect to provider payment-method setup link.
 * Card/bank numbers are forwarded to Stripe only — never logged (TD-6).
 */
export function PaymentSetupPage({
  config,
  oidc,
  /** Test seam — open the provider URL (defaults to location.assign). */
  openUrl = (url: string) => {
    window.location.assign(url);
  },
}: {
  config: WebConfig;
  oidc: OidcFacade;
  openUrl?: (url: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<OnboardingSession | null>(null);
  const [form] = Form.useForm();

  async function startOnboarding() {
    setLoading(true);
    setError(null);
    try {
      const token = await oidc.getAccessToken();
      if (!token) throw new Error("No access token");
      const next = await createPaymentOnboarding(config.apiBaseUrl, token);
      setSession(next);
      if (next.mode === "link" && next.url) {
        openUrl(next.url);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Onboarding failed");
    } finally {
      setLoading(false);
    }
  }

  async function submitRequirements(values: {
    businessType: "individual" | "company";
    businessProfileUrl: string;
    businessProfileMcc: string;
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    line1: string;
    city: string;
    postalCode: string;
    country: string;
    accountNumber: string;
    currency: string;
    tosAccepted: boolean;
  }) {
    setLoading(true);
    setError(null);
    try {
      const token = await oidc.getAccessToken();
      if (!token) throw new Error("No access token");
      const next = await submitPaymentOnboardingRequirements(
        config.apiBaseUrl,
        token,
        {
          businessType: values.businessType,
          businessProfileUrl: values.businessProfileUrl,
          businessProfileMcc: values.businessProfileMcc,
          representative: {
            firstName: values.firstName,
            lastName: values.lastName,
            email: values.email,
            phone: values.phone,
            address: {
              line1: values.line1,
              city: values.city,
              postalCode: values.postalCode,
              country: values.country,
            },
          },
          externalAccount: {
            country: values.country,
            currency: values.currency,
            accountNumber: values.accountNumber,
          },
          tosAccepted: values.tosAccepted,
        },
      );
      setSession(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "KYC submit failed");
    } finally {
      setLoading(false);
    }
  }

  const showRequirements =
    session?.mode === "requirements" && session.status !== "complete";

  return (
    <PageFrame title="Payment setup">
      {error && <Alert type="error" message={error} showIcon />}

      <Card>
        <Paragraph>
          Producers complete Stripe Connect identity and bank details in this
          form (INT-190). Consumers add a payment method via Stripe-hosted setup.
          This app never logs card or bank numbers (REQ-051, TD-6).
        </Paragraph>

        {!session && (
          <Button type="primary" size="large" loading={loading} onClick={startOnboarding}>
            Start payment setup
          </Button>
        )}

        {session?.mode === "link" && session.url && (
          <Paragraph type="secondary" style={{ marginTop: 16 }}>
            Provider link issued. If you were not redirected,{" "}
            <a href={session.url} rel="noreferrer">
              open Stripe payment-method setup
            </a>
            .
          </Paragraph>
        )}

        {session?.status === "complete" && (
          <Alert
            type="success"
            showIcon
            message="Payment account ready"
            description={
              session.stripeAccountId
                ? `Connect account ${session.stripeAccountId} is complete.`
                : "Onboarding complete."
            }
          />
        )}

        {showRequirements && (
          <>
            <Paragraph>
              <Text type="secondary">
                Outstanding: {(session.currentlyDue ?? []).join(", ") || "none"}
              </Text>
            </Paragraph>
            <Form
              form={form}
              layout="vertical"
              onFinish={submitRequirements}
              initialValues={{
                businessType: "individual",
                businessProfileMcc: "5734",
                country: "DE",
                currency: "eur",
                tosAccepted: false,
              }}
            >
              <Form.Item
                name="businessType"
                label="Business type"
                rules={[{ required: true }]}
              >
                <Select
                  options={[
                    { value: "individual", label: "Individual" },
                    { value: "company", label: "Company" },
                  ]}
                />
              </Form.Item>
              <Form.Item
                name="businessProfileUrl"
                label="Business profile URL"
                rules={[{ required: true, type: "url" }]}
              >
                <Input placeholder="https://…" />
              </Form.Item>
              <Form.Item
                name="businessProfileMcc"
                label="MCC"
                rules={[{ required: true }]}
              >
                <Input placeholder="5734" />
              </Form.Item>
              <Form.Item name="firstName" label="First name" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item name="lastName" label="Last name" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item
                name="email"
                label="Email"
                rules={[{ required: true, type: "email" }]}
              >
                <Input />
              </Form.Item>
              <Form.Item name="phone" label="Phone">
                <Input />
              </Form.Item>
              <Form.Item name="line1" label="Address" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item name="city" label="City" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item
                name="postalCode"
                label="Postal code"
                rules={[{ required: true }]}
              >
                <Input />
              </Form.Item>
              <Form.Item name="country" label="Country" rules={[{ required: true }]}>
                <Input maxLength={2} placeholder="DE" />
              </Form.Item>
              <Form.Item name="currency" label="Bank currency" rules={[{ required: true }]}>
                <Input maxLength={3} placeholder="eur" />
              </Form.Item>
              <Form.Item
                name="accountNumber"
                label="Bank account (IBAN / test number)"
                rules={[{ required: true }]}
              >
                <Input autoComplete="off" />
              </Form.Item>
              <Form.Item
                name="tosAccepted"
                valuePropName="checked"
                rules={[
                  {
                    validator: (_, v) =>
                      v
                        ? Promise.resolve()
                        : Promise.reject(new Error("Accept Stripe terms")),
                  },
                ]}
              >
                <Checkbox>
                  I accept the Stripe Connected Account Agreement
                </Checkbox>
              </Form.Item>
              <Button type="primary" htmlType="submit" loading={loading}>
                Submit KYC
              </Button>
            </Form>
          </>
        )}
      </Card>
    </PageFrame>
  );
}
