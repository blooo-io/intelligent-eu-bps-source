/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OIDC_AUTHORITY?: string;
  readonly VITE_OIDC_CLIENT_ID?: string;
  /** Dot-path of the roles claim (NFR-013), default realm_access.roles. */
  readonly VITE_OIDC_ROLE_CLAIM?: string;
  readonly VITE_API_BASE_URL?: string;
  /** Stripe test publishable key (INT-191 / BR-12). */
  readonly VITE_STRIPE_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
