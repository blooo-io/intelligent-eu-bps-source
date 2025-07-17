# AGENTS.md — guide for coding agents and developers

This file tells an agent **what to read, in which order, and which rules are non-negotiable** before changing anything in this repository. The detailed rules are the project rule files shipped with this repository.

## 1. Context in five lines
- Billing & Payment Service of the Horizon Europe project INTELLIGENT (Task T5.6, Deliverable D5.5, public). Led by Blooo.
- **Billing model ("the producer is the bank"):**
  - one invoice per consumer→producer pair and per period, issued in the producer's name (self-billing);
  - purchases and sales between the same pair are netted;
  - amounts below the threshold are carried forward;
  - early settlement is possible;
  - payment goes directly to the producer's Stripe Connect account.
- **V1:** every community is virtual and **only Stripe test mode is integrated**. GSY DEX, EWDS and ECB are mocked behind adapters.
- **Architecture:** 13 NestJS modules (one per logical block) + a Refine web app + a mock suite, on Kubernetes (Scaleway Kapsule, nl-ams). Events go through a transactional outbox → Debezium → NATS JetStream. Workflows run on Temporal. APISIX is the gateway and Keycloak the identity provider.
- **Work items** live in Jira project `INT` (Blooo). **Specification and architecture** live in `docs/` (source of truth).

## 2. Read before coding (in this order)
1. The Jira issue you are working on (`INT-xxx`): scope, covered `REQ-xxx` / `UAT-xxx`, module.
2. `docs/architecture/README.md`, then the views relevant to your task:
   - `01-functional-architecture.md`: actors, processes, **business rules BR-01..BR-13**;
   - `02-logical-architecture.md`: blocks, data ownership, events, lifecycles, scheduled jobs;
   - `03-application-architecture.md`: modules AC-01..AC-15, **public and internal APIs**, event catalogue, adapters, mock scenarios;
   - `04-technical-architecture.md`: technology decisions TD-1..TD-13, principles TP-1..TP-8, security;
   - `05-physical-architecture.md`: environments, hosts, operations.
3. `docs/requirements/items/requirements/REQ-xxx.md` and `.../uat/UAT-xxx.md` for each item in scope. These item notes are the source of truth; `requirements.md` is the narrative view. Also read the **Assumptions A1–A33** at the end of `requirements.md`.
4. The contracts in `contracts/` for the APIs and events you touch.

## 3. Non-negotiable rules
1. **Contract first.** Change or create the OpenAPI/AsyncAPI contract first, then the mock, then the code. The implementation must satisfy the contract (`express-openapi-validator`, Schemathesis in CI).
2. **Module boundaries.**
   - A module never reads or writes another module's database.
   - Cross-module communication goes only through internal APIs (03 §3.2) or events (03 §4).
3. **Events:** write business data and the outbox row in the same transaction. Consumers are idempotent (deduplicate on `eventId`).
4. **Single master per data item (TP-7):**
   - Stripe is master of accounts, KYC, invoices and payments; we store only Stripe ids, links and a rebuildable read cache.
   - Billing never changes a trade status.
5. **No personal data** in logs, traces, events or EWDS messages. Use identifiers only.
6. **Dependencies:** MIT or Apache-2.0 only (TP-2). Check the licence before adding a package. AGPL, GPL, SSPL and BUSL are refused.
7. **External systems** are reached only through adapters (ports). In V1, every adapter except Stripe uses the mock implementation, selected by configuration.
8. **Secrets** are never committed. They come from OpenBao via External Secrets.
9. **Traceability:**
   - test names and PR descriptions reference the `REQ-xxx` / `UAT-xxx` they cover;
   - when a UAT passes, update its `status` in `docs/requirements/items/uat/UAT-xxx.md` in the same PR.
10. **Specification changes:**
    - never renumber IDs; deprecate instead;
    - if the code reveals a gap in the spec, propose the spec change in the PR description and do not silently diverge.
11. **Diagrams:** Mermaid. Flowchart, state, ER and class diagrams start with `%% elk %%`.

## 4. Typical task flow
`INT-xxx` (Jira; create the issue first if none exists) → branch `<type>/INT-xxx-short-description` from `develop` (`feature`, `fix`, `docs`, `test`, `refactor`, `ci` or `chore`, matching the commit type) → contract → Prism mock → generated types/clients → implementation → unit tests + UAT scenario (mocks + Stripe test) → PR (template) → CI green, including every test script and 80% statements, branches, functions and lines per module → review → merge → Argo CD deploys to `dev`.

## 5. Module map (directory → component → logical block)
| Directory | Component | Block |
|---|---|---|
| `apps/web` | AC-01 Web app | — |
| `deploy/` (APISIX config) | AC-02 API gateway | LB-12, LB-01 |
| `services/participants` | AC-03 | LB-02 |
| `services/trade-intake` | AC-04 | LB-03 |
| `services/settlement` | AC-05 | LB-04 |
| `services/invoicing` | AC-06 | LB-05 |
| `services/payments` | AC-07 | LB-06 |
| `services/reconciliation` | AC-08 | LB-07 |
| `services/reporting` | AC-09 | LB-14 |
| `services/publication` | AC-10 | LB-08 |
| `services/notification` | AC-11 | LB-09 |
| `services/compliance` | AC-12 | LB-10 |
| `services/reference-data` | AC-13 | LB-11 |
| `services/scheduler` | AC-14 (Temporal workers) | LB-13 |
| `mocks/` | AC-15 Mock suite | — |
| `packages/module-template` | Shared NestJS module template (health, config, outbox, idempotent consumer, OTel, auth guard) | — |
