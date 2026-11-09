export { loadModuleConfig, moduleConfigSchema } from "./config/module-config.js";
export type { ModuleConfig } from "./config/module-config.js";

export { redactPersonalData } from "./logging/redact.js";
export { asString } from "./util/as-string.js";

export { OutboxService } from "./outbox/outbox.service.js";
export type { AppendOutboxInput } from "./outbox/outbox.service.js";
export {
  InMemoryOutboxStore,
  type DomainEventEnvelope,
  type OutboxRow,
  type OutboxStore,
} from "./outbox/outbox.types.js";
export {
  PostgresOutboxStore,
  resolveOutboxStore,
  type SqlExecutor,
  type SqlQueryResult,
} from "./outbox/postgres-outbox.store.js";
export {
  createPgPoolExecutor,
  defaultOutboxStore,
} from "./outbox/create-pg-outbox-store.js";

export {
  IdempotentConsumer,
  InMemoryProcessedEventsStore,
  type ConsumeResult,
  type EventHandler,
  type ProcessedEventsStore,
} from "./consumer/idempotent-consumer.js";

export {
  ModuleAuthGuard,
  assertCommunityScope,
  assertHasRole,
  type AuthGuardOptions,
} from "./auth/auth.guard.js";
export type { AuthClaims, AuthenticatedRequest } from "./auth/auth.types.js";
export {
  principalMiddleware,
  servicePrincipalMiddleware,
} from "./auth/principal.middleware.js";
export {
  ServiceTokenClient,
  buildServiceRequestHeaders,
  type ServiceTokenClientOptions,
} from "./auth/service-token.client.js";
export {
  resolveServiceAuthHeaders,
  type ServiceAuthSource,
} from "./auth/service-auth-headers.js";
export {
  verifyServiceAccessToken,
  serviceJwtRequired,
  resolveServiceJwtOptions,
  resetServiceJwtJwksCache,
  type ServiceJwtVerifierOptions,
} from "./auth/service-jwt.js";
export {
  DEFAULT_OIDC_ROLE_CLAIM,
  resolveRoleClaimPath,
  rolesAtClaimPath,
} from "./auth/role-claim.js";

export { HealthController, type HealthResponse } from "./health/health.controller.js";

export { getMeter, getTracer, startModuleSpan } from "./telemetry/otel.js";

export {
  ModuleTemplateModule,
  type ModuleTemplateOptions,
} from "./module-template.module.js";
export {
  MODULE_NAME,
  OUTBOX_STORE,
  PROCESSED_EVENTS_STORE,
} from "./module-template.tokens.js";
