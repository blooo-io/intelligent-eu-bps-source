# Platform packaging (events — TD-7 / INT-132)

Application modules stay under `deploy/charts/<ac-module>/`. Shared event transport is packaged here and under dedicated charts:

| Chart | Namespace | Role |
|---|---|---|
| `deploy/charts/nats` | `nats` (shared) | NATS JetStream; one account per environment |
| `deploy/charts/debezium-server` | `int-data` / `demo-data` | Debezium Server: PostgreSQL CDC outbox → JetStream |

Argo applications:

- `deploy/argocd/platform/nats.yaml` — shared, tracks `develop`
- `deploy/argocd/dev/debezium-server.yaml` → `int-data`
- `deploy/argocd/demo/debezium-server.yaml` → `demo-data` (manual)

`replicaCount` for Debezium stays **0** until CloudNativePG databases and OpenBao credentials exist (INT-133). Consumers remain idempotent via the NestJS module template (INT-98).

NACK operator (full CRD lifecycle) can replace the StatefulSet later without changing the NATS service DNS `nats.nats.svc.cluster.local:4222` expected by module NetworkPolicies.
