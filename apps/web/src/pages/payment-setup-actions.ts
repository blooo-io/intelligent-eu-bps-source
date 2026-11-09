import type { WebConfig } from "../api/config";
import type { OidcFacade } from "../auth/oidc";
import {
  attachMyPaymentMethod,
  createPaymentOnboarding,
  fetchMyPaymentAccount,
  type MePaymentAccount,
  type OnboardingSession,
} from "../api/payment";

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

/**
 * INT-362 — mint a new Account Session for the embedded onboarding component.
 * Start is idempotent on the server: it reuses the producer's Connect account.
 */
export async function refreshOnboardingClientSecret(input: {
  config: WebConfig;
  oidc: OidcFacade;
}): Promise<string> {
  const token = await input.oidc.getAccessToken();
  if (!token) throw new Error("No access token");
  const session = await createPaymentOnboarding(input.config.apiBaseUrl, token);
  if (session.mode !== "embedded" || !session.clientSecret) {
    throw new Error("Stripe onboarding session unavailable");
  }
  return session.clientSecret;
}
