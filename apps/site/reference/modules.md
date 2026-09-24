# Modules

Directory → application component map:

| Directory | Component | Role |
|---|---|---|
| `apps/web` | AC-01 | Reference web app |
| `deploy/` (APISIX) | AC-02 | API gateway config |
| `services/participants` | AC-03 | Participants & communities |
| `services/trade-intake` | AC-04 | Trade intake |
| `services/settlement` | AC-05 | Settlement / billing runs |
| `services/invoicing` | AC-06 | Invoicing |
| `services/payments` | AC-07 | Payments & Connect |
| `services/reconciliation` | AC-08 | Reconciliation |
| `services/reporting` | AC-09 | Reporting & exports |
| `services/publication` | AC-10 | Data-space publication |
| `services/notification` | AC-11 | Notifications |
| `services/compliance` | AC-12 | Compliance / DSR |
| `services/reference-data` | AC-13 | Reference data |
| `services/scheduler` | AC-14 | Temporal workers |
| `mocks/` | AC-15 | Mock suite |

Shared NestJS template: `packages/module-template` (health, config, outbox, OTel, auth guard).
