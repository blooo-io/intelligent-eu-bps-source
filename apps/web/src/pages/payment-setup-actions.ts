import type { WebConfig } from "../api/config";
import type { ParticipantRole } from "../api/me";
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
import type { PaymentKycFormValues } from "./payment-setup-kyc-form";

async function refreshPaymentAccountSummary(
  apiBaseUrl: string,
  token: string,
): Promise<MePaymentAccount | null> {
  try {
    return await fetchMyPaymentAccount(apiBaseUrl, token);
  } catch {
    return null;
  }
}

export async function startPaymentOnboarding(input: {
  config: WebConfig;
  oidc: OidcFacade;
  openUrl: (url: string) => void;
  onComplete?: () => void;
}): Promise<{
  session: OnboardingSession;
  account: MePaymentAccount | null;
}> {
  const token = await input.oidc.getAccessToken();
  if (!token) throw new Error("No access token");
  const session = await createPaymentOnboarding(input.config.apiBaseUrl, token);
  let account: MePaymentAccount | null = null;
  if (session.status === "complete") {
    account = await refreshPaymentAccountSummary(input.config.apiBaseUrl, token);
    input.onComplete?.();
  }
  if (session.mode === "link" && session.url) {
    input.openUrl(session.url);
  }
  return { session, account };
}

export async function attachPaymentMethodOnboarding(input: {
  config: WebConfig;
  oidc: OidcFacade;
  paymentMethodId: string;
  onComplete?: () => void;
}): Promise<OnboardingSession> {
  const token = await input.oidc.getAccessToken();
  if (!token) throw new Error("No access token");
  const session = await attachMyPaymentMethod(
    input.config.apiBaseUrl,
    token,
    input.paymentMethodId,
  );
  if (session.status === "complete") {
    input.onComplete?.();
  }
  return session;
}

async function accountTokenForKyc(
  config: WebConfig,
  values: PaymentKycFormValues,
  dob: { day: number; month: number; year: number },
  identityDoc: string | undefined,
  loadStripe?: LoadStripeFn,
) {
  if (!config.stripePublishableKey) return undefined;
  return createAccountToken(
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

export async function submitPaymentKycRequirements(input: {
  config: WebConfig;
  oidc: OidcFacade;
  values: PaymentKycFormValues;
  marketRole: ParticipantRole | null;
  loadStripe?: LoadStripeFn;
  onComplete?: () => void;
}): Promise<{ session: OnboardingSession; account: MePaymentAccount | null }> {
  const token = await input.oidc.getAccessToken();
  if (!token) throw new Error("No access token");

  const dob = {
    day: Number(input.values.dobDay),
    month: Number(input.values.dobMonth),
    year: Number(input.values.dobYear),
  };
  const identityDoc = input.values.identityDocumentFront?.trim() || undefined;
  const accountToken = await accountTokenForKyc(
    input.config,
    input.values,
    dob,
    identityDoc,
    input.loadStripe,
  );

  const session = await submitPaymentOnboardingRequirements(
    input.config.apiBaseUrl,
    token,
    {
      accountToken,
      country: input.values.country,
      businessType: input.values.businessType,
      businessProfileUrl: input.values.businessProfileUrl,
      businessProfileMcc: input.values.businessProfileMcc,
      representative: {
        firstName: input.values.firstName,
        lastName: input.values.lastName,
        email: input.values.email,
        phone: input.values.phone,
        dob,
        address: {
          line1: input.values.line1,
          city: input.values.city,
          postalCode: input.values.postalCode,
          country: input.values.country,
        },
      },
      externalAccount: {
        country: input.values.country,
        currency: input.values.currency,
        accountNumber: input.values.accountNumber,
      },
      tosAccepted: input.values.tosAccepted,
    },
  );

  if (session.status !== "complete") {
    return { session, account: null };
  }
  if (input.marketRole === "prosumer") {
    const elements = await createPaymentOnboarding(input.config.apiBaseUrl, token);
    if (elements.status === "complete") {
      input.onComplete?.();
    }
    const account = await refreshPaymentAccountSummary(
      input.config.apiBaseUrl,
      token,
    );
    return { session: elements, account };
  }
  input.onComplete?.();
  return { session, account: null };
}
