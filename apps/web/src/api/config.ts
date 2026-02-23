/**
 * Runtime front-end config for AC-01.
 * Production loads `/config.json` from the static server (env-driven).
 * Local Vite falls back to import.meta.env / sensible defaults.
 */

export type WebConfig = {
  /** OIDC issuer (Keycloak realm URL). NFR-011 / REQ-033. */
  oidcAuthority: string;
  /** Public PKCE client id — never a secret (REQ-033). */
  oidcClientId: string;
  /** Public API origin (APISIX /v1). */
  apiBaseUrl: string;
  /**
   * Stripe test publishable key for Account Tokens (INT-191 / BR-12).
   * Public by design (`pk_test_…`); never a secret key.
   */
  stripePublishableKey?: string;
};

const DEFAULTS: WebConfig = {
  oidcAuthority: "https://auth.intelligent-eu-bp.blooo.dev/realms/int",
  oidcClientId: "web",
  apiBaseUrl: "https://api.dev.intelligent-eu-bp.blooo.dev",
  stripePublishableKey: undefined,
};

let cached: WebConfig | null = null;

/** Resolve config once per page load. */
export async function loadConfig(fetchImpl: typeof fetch = fetch): Promise<WebConfig> {
  if (cached) return cached;

  try {
    const res = await fetchImpl("/config.json", { credentials: "same-origin" });
    if (res.ok) {
      const body = (await res.json()) as Partial<WebConfig>;
      cached = {
        oidcAuthority: body.oidcAuthority ?? DEFAULTS.oidcAuthority,
        oidcClientId: body.oidcClientId ?? DEFAULTS.oidcClientId,
        apiBaseUrl: body.apiBaseUrl ?? DEFAULTS.apiBaseUrl,
        stripePublishableKey:
          body.stripePublishableKey ?? DEFAULTS.stripePublishableKey,
      };
      return cached;
    }
  } catch {
    // Local Vite has no /config.json — use build-time env.
  }

  cached = {
    oidcAuthority: import.meta.env.VITE_OIDC_AUTHORITY ?? DEFAULTS.oidcAuthority,
    oidcClientId: import.meta.env.VITE_OIDC_CLIENT_ID ?? DEFAULTS.oidcClientId,
    apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? DEFAULTS.apiBaseUrl,
    stripePublishableKey:
      import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? DEFAULTS.stripePublishableKey,
  };
  return cached;
}

/** Test seam — clear the memoised config between cases. */
export function resetConfigCache(): void {
  cached = null;
}
