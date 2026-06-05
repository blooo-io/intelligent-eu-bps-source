/**
 * Public `/v1` API TypeScript types (INT-244 / TD-13 / REQ-052).
 * Generated from `contracts/openapi/public.v1.yaml` — do not hand-edit schema.d.ts.
 */
export type { paths, components, operations, webhooks } from "./schema";

/** Convenience alias for integrators reading the OpenAPI `components.schemas` map. */
export type PublicSchemas = import("./schema").components["schemas"];

/** Matches `info.version` in `contracts/openapi/public.v1.yaml`. */
export const PUBLIC_OPENAPI_VERSION = "1.0.0";
