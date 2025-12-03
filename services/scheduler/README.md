# `services/scheduler` (AC-14)

Time-based job catalogue and dispatch to owning modules (INT-113 / REQ-006, logical §4.5).
Temporal owns schedules in production; this module records executions and issues the internal API commands.

| Operation | Path | Spec |
|---|---|---|
| ListJobs | `GET /v1/jobs` | 02 §4.5 |
| RunJob | `POST /v1/jobs/{id}:run` | REQ-006 / UAT-006 |

Publishes `JobFailed` on dispatch failure (AC-11). V1 uses an in-process dispatcher mock; HTTP base URLs can be wired later via env.
