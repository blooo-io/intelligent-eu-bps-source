import { useEffect, useState } from "react";
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
import { fetchMe, type ParticipantRole } from "../api/me";
import type { OidcFacade } from "../auth/oidc";
import {
  attachMyPaymentMethod,
  createPaymentOnboarding,
  fetchMyPaymentAccount,
  submitPaymentOnboardingRequirements,
  type MePaymentAccount,
  type OnboardingSession,
} from "../api/payment";
import {
  createAccountToken,
  type LoadStripeFn,
} from "../api/stripe-account-token";
import type { LoadStripeSetupFn } from "../api/stripe-setup-element";
import { ConsumerPaymentElement } from "../components/consumer-payment-element";
import { PageFrame } from "../layout/page-frame";
import { isSellerRole } from "../layout/role-home";

const { Paragraph, Text } = Typography;

/**
 * Payment setup (INT-140 / INT-190 / INT-191 / INT-193 / INT-252 / REQ-051 / UAT-051).
 * Producer: in-platform Connect KYC via Account Tokens (Custom accounts, FR).
 * Consumer: SetupIntent + Payment Element (INT-193); link mode as fallback.
 * Card/bank numbers are forwarded to Stripe only — never logged (TD-6).
 * Volt labels: Payment method (consumer) / Payout account (producer).
 */
export function PaymentSetupPage({
  config,
  oidc,
  /** Test seam — open the provider URL (defaults to location.assign). */
  openUrl = (url: string) => {
    window.location.assign(url);
  },
  /** Test seam — Stripe.js loader for Account Tokens (INT-191). */
  loadStripe,
  /** Test seam — Stripe.js loader for Payment Element / SetupIntent (INT-193). */
  loadStripeSetup,
  /** When set, called after onboarding reaches status complete (wizard). */
  onComplete,
  /** Hide PageFrame chrome when embedded in the onboarding wizard. */
  embedded = false,
}: {
  config: WebConfig;
  oidc: OidcFacade;
  openUrl?: (url: string) => void;
  loadStripe?: LoadStripeFn;
  loadStripeSetup?: LoadStripeSetupFn;
  onComplete?: () => void;
  embedded?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<OnboardingSession | null>(null);
  const [marketRole, setMarketRole] = useState<ParticipantRole | null>(null);
  const [readiness, setReadiness] = useState<string | null>(null);
  const [account, setAccount] = useState<MePaymentAccount | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await oidc.getAccessToken();
        if (!token) return;
        const me = await fetchMe(config.apiBaseUrl, token);
        if (!cancelled) {
          setMarketRole(me.role);
          setReadiness(me.readiness);
        }
        // INT-255 — Ready Payment method / Payout: brand·last4 or dashboard CTA.
        if (me.readiness === "Ready") {
          try {
            const summary = await fetchMyPaymentAccount(
              config.apiBaseUrl,
              token,
            );
            if (!cancelled) setAccount(summary);
          } catch {
            // Keep Ready chrome even if summary fails; user can re-open setup.
          }
        }
      } catch {
        // Session mode still reveals consumer vs producer after Start.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [config.apiBaseUrl, oidc]);

  async function startOnboarding() {
    setLoading(true);
    setError(null);
    try {
      const token = await oidc.getAccessToken();
      if (!token) throw new Error("No access token");
      const next = await createPaymentOnboarding(config.apiBaseUrl, token);
      setSession(next);
      if (next.status === "complete") {
        // INT-255 — PM already on file: refresh Ready summary (brand/last4).
        try {
          setAccount(await fetchMyPaymentAccount(config.apiBaseUrl, token));
        } catch {
          // Summary optional; success Alert still covers complete session.
        }
        onComplete?.();
      }
      if (next.mode === "link" && next.url) {
        openUrl(next.url);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Onboarding failed");
    } finally {
      setLoading(false);
    }
  }

  async function onPaymentMethodAttached(paymentMethodId: string) {
    const token = await oidc.getAccessToken();
    if (!token) throw new Error("No access token");
    const next = await attachMyPaymentMethod(
      config.apiBaseUrl,
      token,
      paymentMethodId,
    );
    setSession(next);
    if (next.status === "complete") {
      onComplete?.();
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
    dobDay: number;
    dobMonth: number;
    dobYear: number;
    line1: string;
    city: string;
    postalCode: string;
    country: string;
    accountNumber: string;
    currency: string;
    tosAccepted: boolean;
    /** INT-195 — optional Stripe File id / test token for identity document. */
    identityDocumentFront?: string;
  }) {
    setLoading(true);
    setError(null);
    try {
      const token = await oidc.getAccessToken();
      if (!token) throw new Error("No access token");

      const dob = {
        day: Number(values.dobDay),
        month: Number(values.dobMonth),
        year: Number(values.dobYear),
      };
      const identityDoc = values.identityDocumentFront?.trim() || undefined;

      let accountToken: string | undefined;
      if (config.stripePublishableKey) {
        // INT-191 / INT-195 — tokenize PII (+ optional identity doc) in the browser.
        accountToken = await createAccountToken(
          config.stripePublishableKey,
          {
            businessType: values.businessType,
            firstName: values.firstName,
            lastName: values.lastName,
            email: values.email,
            phone: values.phone,
            dob,
            line1: values.line1,
            city: values.city,
            postalCode: values.postalCode,
            country: values.country,
            tosAccepted: values.tosAccepted,
            identityDocumentFront: identityDoc,
            identityDocumentAdditionalFront: identityDoc,
          },
          loadStripe,
        );
      }

      const next = await submitPaymentOnboardingRequirements(
        config.apiBaseUrl,
        token,
        {
          accountToken,
          country: values.country,
          businessType: values.businessType,
          businessProfileUrl: values.businessProfileUrl,
          businessProfileMcc: values.businessProfileMcc,
          representative: {
            firstName: values.firstName,
            lastName: values.lastName,
            email: values.email,
            phone: values.phone,
            dob,
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
      if (next.status === "complete") {
        // INT-269 — prosumer continues to card SetupIntent after Connect KYC.
        if (marketRole === "prosumer") {
          const elements = await createPaymentOnboarding(
            config.apiBaseUrl,
            token,
          );
          setSession(elements);
          if (elements.status === "complete") {
            try {
              setAccount(await fetchMyPaymentAccount(config.apiBaseUrl, token));
            } catch {
              // Summary optional.
            }
            onComplete?.();
          }
          return;
        }
        onComplete?.();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "KYC submit failed");
    } finally {
      setLoading(false);
    }
  }

  const showRequirements =
    session?.mode === "requirements" && session.status !== "complete";

  const asProsumer = marketRole === "prosumer";
  const asProducer =
    (isSellerRole(marketRole) && !asProsumer) ||
    (session?.mode === "requirements" && !asProsumer);
  // INT-254 / Volt MockSetup vs MockPayment: setup titles until Ready.
  // Treat unknown readiness as incomplete so the Start CTA is not hidden while /me loads.
  const setupIncomplete = readiness !== "Ready";
  const pageTitle = asProsumer
    ? setupIncomplete
      ? "Payouts and card"
      : "Payment account"
    : asProducer
      ? setupIncomplete
        ? "Open Stripe Connect"
        : "Payout account"
      : setupIncomplete
        ? "Add a payment method"
        : "Payment method";
  const pageDescription = asProsumer
    ? setupIncomplete
      ? "Complete Connect KYC, then save a card to pay when you buy."
      : "Connect receives sales; your card pays open invoices when you buy."
    : asProducer
      ? setupIncomplete
        ? "Producers receive payouts on their Connect account. Complete KYC once."
        : "Stripe Connect receives consumer payments for invoices in your name."
      : setupIncomplete
        ? "Save a card so open invoices can be paid in one click."
        : "Card used when you pay open invoices.";
  const startLabel = asProsumer
    ? "Start payouts and card setup"
    : asProducer
      ? "Continue to Stripe Connect"
      : "Save card and finish";

  const brandLabel = account?.brand
    ? account.brand.charAt(0).toUpperCase() + account.brand.slice(1)
    : null;
  const readyConsumerCard =
    Boolean(account?.last4) &&
    (!setupIncomplete || session?.status === "complete") &&
    (asProsumer || (!asProducer && account?.status === "complete"));

  const body = (
    <>
      {error && <Alert type="error" message={error} showIcon />}

      <Card>
        <Paragraph>
          {asProsumer
            ? setupIncomplete
              ? "Prosumers need Connect for sales and a card for purchases. Bank and card details go to Stripe only — this app never stores them."
              : "Connect receives sales; your card pays open invoices when you buy. Details stay with Stripe only."
            : asProducer
              ? setupIncomplete
                ? "Producers receive payouts on their Connect account. Complete KYC once. Bank details go to Stripe only — this app never stores them."
                : "Stripe Connect receives consumer payments for invoices in your name. Bank details go to Stripe only — this app never stores them."
              : setupIncomplete
                ? "Save a card so open invoices can be paid in one click. Card numbers go to Stripe only — this app never stores them."
                : "Card used when you pay open invoices. Card numbers go to Stripe only — this app never stores them."}
        </Paragraph>

        {readyConsumerCard && (
          <div data-testid="payment-method-ready" style={{ marginBottom: 16 }}>
            <Paragraph style={{ marginBottom: 4 }}>
              <Text strong>
                {brandLabel ?? "Card"} ···· {account!.last4}
              </Text>
            </Paragraph>
            <Paragraph type="secondary" style={{ marginBottom: 0 }}>
              Default for invoice pay
            </Paragraph>
          </div>
        )}

        {!setupIncomplete &&
          (asProducer || asProsumer) &&
          account?.stripeAccountId && (
          <div data-testid="payout-account-ready" style={{ marginBottom: 16 }}>
            <Paragraph type="secondary" style={{ marginBottom: 12 }}>
              Connect account <Text code>{account.stripeAccountId}</Text>
            </Paragraph>
            {account.dashboardUrl ? (
              <Button
                type="primary"
                href={account.dashboardUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open Stripe dashboard
              </Button>
            ) : null}
          </div>
        )}

        {!session && setupIncomplete && (
          <Button type="primary" size="large" loading={loading} onClick={startOnboarding}>
            {startLabel}
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

        {session?.mode === "elements" &&
          session.status !== "complete" &&
          session.clientSecret && (
            <div style={{ marginTop: 16 }}>
              <Paragraph type="secondary">
                Enter a test card (for example 4242 4242 4242 4242) to save a
                payment method.
              </Paragraph>
              <ConsumerPaymentElement
                config={config}
                clientSecret={session.clientSecret}
                onAttached={onPaymentMethodAttached}
                loadStripe={loadStripeSetup}
              />
            </div>
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
                country: "FR",
                currency: "eur",
                // INT-195 — Stripe Connect test DOB for immediate verification match.
                dobDay: 1,
                dobMonth: 1,
                dobYear: 1902,
                // INT-195 — test address token (docs.stripe.com/connect/testing).
                line1: "address_full_match",
                city: "Paris",
                postalCode: "75002",
                identityDocumentFront: "file_identity_document_success",
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
              <Form.Item
                name="dobDay"
                label="Date of birth — day"
                rules={[{ required: true }]}
              >
                <Input type="number" min={1} max={31} placeholder="1" />
              </Form.Item>
              <Form.Item
                name="dobMonth"
                label="Date of birth — month"
                rules={[{ required: true }]}
              >
                <Input type="number" min={1} max={12} placeholder="1" />
              </Form.Item>
              <Form.Item
                name="dobYear"
                label="Date of birth — year"
                rules={[{ required: true }]}
                extra="Test mode: use year 1902 for an immediate date-of-birth match."
              >
                <Input type="number" min={1900} max={2100} placeholder="1902" />
              </Form.Item>
              <Form.Item
                name="line1"
                label="Address"
                rules={[{ required: true }]}
                extra="Test mode: address_full_match (Stripe Connect testing tokens)."
              >
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
                <Input maxLength={2} placeholder="FR" />
              </Form.Item>
              <Form.Item
                name="identityDocumentFront"
                label="Identity document file id (optional)"
                extra="Test mode: use file_identity_document_success if identity checks need a file token."
              >
                <Input placeholder="file_identity_document_success" />
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
                  I accept the{" "}
                  <a
                    href="https://stripe.com/connect-account/legal"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Stripe Connected Account Agreement
                  </a>
                </Checkbox>
              </Form.Item>
              <Button type="primary" htmlType="submit" loading={loading}>
                Submit KYC
              </Button>
            </Form>
          </>
        )}
      </Card>
    </>
  );

  if (embedded) {
    return body;
  }
  return (
    <PageFrame title={pageTitle} description={pageDescription}>
      {body}
    </PageFrame>
  );
}
