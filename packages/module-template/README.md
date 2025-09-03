# `@intelligent/module-template`

Shared NestJS base for every billing module (TD-4, `docs/architecture/04-technical-architecture.md`).

## Provides

| Piece | Purpose | Spec |
|---|---|---|
| `loadModuleConfig` | Typed environment configuration | TD-4 |
| `HealthController` | `GET /health` for probes | TD-4 |
| `ModuleAuthGuard` | Role + community re-check | REQ-010 |
| `OutboxService` | Append-only transactional outbox row | TD-7, NFR-003, UAT-035 |
| `IdempotentConsumer` | Dedupe on `eventId`, retry-safe failures | TD-7, NFR-006, UAT-038 |
| `redactPersonalData` | Strip PII from structured logs | NFR-015 |
| OpenTelemetry helpers | Tracer / meter accessors | TD-10 |

Stripe and Temporal SDKs are **not** included here; modules that need them add those dependencies themselves (INT-98).

## Usage

```ts
import { ModuleTemplateModule, loadModuleConfig } from "@intelligent/module-template";

const config = loadModuleConfig();

@Module({
  imports: [ModuleTemplateModule.forRoot({ moduleName: config.moduleName })],
})
export class ParticipantsModule {}
```

Wire a PostgreSQL `OutboxStore` in the owning service. Debezium (INT-132) publishes outbox rows to NATS; business code never publishes directly.
