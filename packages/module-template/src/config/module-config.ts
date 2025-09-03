import { z } from "zod";

/** Runtime configuration every NestJS module loads from the environment (TD-4). */
export const moduleConfigSchema = z.object({
  moduleName: z.string().min(1),
  port: z.coerce.number().int().positive().default(3000),
  // CloudNativePG DSNs are postgres://… (not always accepted by z.string().url()).
  databaseUrl: z.string().min(1),
  keycloakIssuerUrl: z.string().url(),
  keycloakAudience: z.string().min(1),
  billingMode: z.enum(["live", "virtual"]).default("virtual"),
  otelServiceName: z.string().min(1).optional(),
});

export type ModuleConfig = z.infer<typeof moduleConfigSchema>;

/**
 * Parse module configuration from process.env.
 * V1 communities are virtual (A32 / BR-12); live mode is rejected unless explicitly set later.
 */
export function loadModuleConfig(
  env: NodeJS.ProcessEnv = process.env,
): ModuleConfig {
  return moduleConfigSchema.parse({
    moduleName: env.MODULE_NAME,
    port: env.PORT,
    databaseUrl: env.DATABASE_URL,
    keycloakIssuerUrl: env.KEYCLOAK_ISSUER_URL,
    keycloakAudience: env.KEYCLOAK_AUDIENCE,
    billingMode: env.BILLING_MODE ?? "virtual",
    otelServiceName: env.OTEL_SERVICE_NAME ?? env.MODULE_NAME,
  });
}
