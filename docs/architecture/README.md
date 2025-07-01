# Architecture: Billing & Payment Service (T5.6 / D5.5)

The architecture is produced **iteratively**, one view at a time. Each view starts only after the previous one has been validated, and each refines the previous one without contradicting it.

| # | View | Question answered | Main content | File | Status |
|---|---|---|---|---|---|
| 1 | **Functional** | What does the service do, for whom? | Actors, functional map, business processes, business objects, business rules, traceability to requirements | [01-functional-architecture.md](01-functional-architecture.md) | **Validated 2026-10-07** |
| 2 | **Logical** | Which logical blocks carry these functions, and how do they interact? | Logical blocks and responsibilities, interfaces between blocks and with external systems, data flows, logical data model | [02-logical-architecture.md](02-logical-architecture.md) | **Validated 2026-10-07** |
| 3 | **Application** | Which applications, services and APIs implement the blocks? | Services/modules, API contracts, events and topics (incl. `ewds-topics/`), adapters and mocks | [03-application-architecture.md](03-application-architecture.md) | **Validated 2026-10-07** |
| 4 | **Technical** | With which technologies and infrastructure services? | Languages, frameworks, database, IdP, Stripe, EWDS Client Gateway, security, observability, CI/CD | [04-technical-architecture.md](04-technical-architecture.md) | **Validated 2026-10-07** |
| 5 | **Physical** | Where and how is it deployed? | Environments, hosting (EU), network, deployment topology, sizing, backup | [05-physical-architecture.md](05-physical-architecture.md) | **Validated 2026-10-08** |

**Diagram conventions:** diagrams are written in Mermaid.
- **Layout:** flowchart, state, ER and class diagrams start with the line `%% elk %%`, which renders them with the ELK layout (orthogonal edges, as on mermaid.live). In Obsidian this needs the community plugin **Mermaid ELK Renderer**. Without the plugin the line is an ordinary Mermaid comment: diagrams still render with the default *dagre* layout, only less cleanly. Sequence diagrams have no layout engine and get no marker.
- **Readability:** keep one concern per diagram, ideally at most about 15 edges. A complete map may be added in addition, but it is readable only with ELK. Exhaustive relationships go in tables.

**Inputs common to all views:**
- `docs/requirements/` (requirements v5, assumptions A1–A32);
- `ewds-topics/` (draft EWDS schemas).

**Legacy documents:** `ARCHITECTURE - outdated to update.md` and `api-contracts - outdated to update.md` are superseded by this series and kept only for history. `identity-federation-model.pptx` was rejected by the pilots in 09/2026 and is also superseded.
