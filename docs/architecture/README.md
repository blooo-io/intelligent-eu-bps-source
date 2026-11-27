# Architecture: Billing & Payment Service (T5.6 / D5.5)

The architecture is produced **iteratively**, one view at a time. Each view starts only after the previous one has been validated, and each refines the previous one without contradicting it.

| # | View | Question answered | Main content | File | Status |
|---|---|---|---|---|---|
| 1 | **Functional** | What does the service do, for whom? | Actors, functional map, business processes, business objects, business rules, traceability to requirements | [01-functional-architecture.md](01-functional-architecture.md) | **Aligned 2026-11-26 (INT-447/448/449)** |
| 2 | **Logical** | Which logical blocks carry these functions, and how do they interact? | Logical blocks and responsibilities, interfaces between blocks and with external systems, data flows, logical data model | [02-logical-architecture.md](02-logical-architecture.md) | **Aligned 2026-11-26 (INT-449)** |
| 3 | **Application** | Which applications, services and APIs implement the blocks? | Services/modules, API contracts, events and topics (incl. `ewds-topics/`), adapters and mocks | [03-application-architecture.md](03-application-architecture.md) | **Aligned 2026-11-26 (INT-447/448/449)** |
| 4 | **Technical** | With which technologies and infrastructure services? | Languages, frameworks, database, IdP, Stripe, EWDS Client Gateway, security, observability, CI/CD | [04-technical-architecture.md](04-technical-architecture.md) | **Revised 2026-11-25 (v6.1), revalidation pending** |
| 5 | **Physical** | Where and how is it deployed? | Environments, hosting (EU), network, deployment topology, sizing, backup | [05-physical-architecture.md](05-physical-architecture.md) | **Revised 2026-11-25 (v6.1), revalidation pending** |
| 6 | **Ontology datamodel** | How do ontology objects relate, and who masters each? | Actor vs UserAccount, ER/class maps, EWDS topic mapping | [06-datamodel-ontology.md](06-datamodel-ontology.md) | **Draft 2026-11-26 (INT-449)** |
| 7 | **Scenario flows** | How do end-to-end journeys run on the EWDS-only path? | Detailed Mermaid sequences S1–S14 (onboard, T&C, KYC, bill, pay, payout, erasure, …) | [07-scenario-flows.md](07-scenario-flows.md) | **Draft 2026-11-26 (INT-449)** |

**Diagram conventions:** diagrams are written in Mermaid.
- **Layout:** flowchart, state, ER and class diagrams start with the line `%% elk %%`, which renders them with the ELK layout (orthogonal edges, as on mermaid.live). In Obsidian this needs the community plugin **Mermaid ELK Renderer**. Without the plugin the line is an ordinary Mermaid comment: diagrams still render with the default *dagre* layout, only less cleanly. Sequence diagrams have no layout engine and get no marker.
- **Readability:** keep one concern per diagram, ideally at most about 15 edges. A complete map may be added in addition, but it is readable only with ELK. Exhaustive relationships go in tables.

**Inputs common to all views:**
- `docs/requirements/` (requirements v6.1, assumptions A1–A33; A21 withdrawn → A4 EWDS-only);
- `ewds-topics/` (draft EWDS schemas; UserAccount on `billingKycStatus`);
- [ewds-client-gateway.md](ewds-client-gateway.md) — Blooo CG deploy plan (INT-306; live path for NFR-017). Status: CGW deployed with mTLS; API key and remaining grants pending EWAG; `dev` uses the Mock CGW (INT-454), `MARKET_ADAPTER=mock`;
- Product locks: **INT-447** (Actor EWDS-only), **INT-448** (T&C on UserAccount), **INT-455** (no public `/v1`, no reference client `apps/web`; external surface = EWDS records + command channel + Stripe webhooks), **INT-463** (R2M owns member IdP; BPS Keycloak = S2S + ops only).
- Identity decisions: [decisions/INT-463-r2m-member-idp.md](decisions/INT-463-r2m-member-idp.md) · [r2m-keycloak-handoff.md](r2m-keycloak-handoff.md) (OIDC Auth Code + PKCE + scoped Admin API for R2M; never put bearer JWT on EWDS).

**Legacy documents:** `ARCHITECTURE - outdated to update.md` and `api-contracts - outdated to update.md` are superseded by this series and kept only for history. `identity-federation-model.pptx` was rejected by the pilots in 09/2026 and is also superseded.
