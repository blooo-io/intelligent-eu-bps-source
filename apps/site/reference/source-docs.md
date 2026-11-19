# Source documentation

Detailed markdown in the Git repository remains the **specification source of truth**. This VitePress site is the **operator- and architect-facing** entry point: the five architecture views are **published here** at build time from `docs/architecture/` (INT-413).

| Area | On this site | In the repository |
|---|---|---|
| Architecture views 01–05 + EWDS | [Architecture](/architecture/) | `docs/architecture/` |
| Modules map | [Modules](/reference/modules) | `AGENTS.md` §5 |
| Requirements, personas, UAT | — (not mirrored yet) | `docs/requirements/` |
| Testing & validation evidence | — | `docs/testing/` |
| Release / freeze notes | — | `docs/release/` |
| OpenAPI / AsyncAPI | [API explorer](/api/) | `contracts/` |
| Deploy charts | [Deploy guide](/guide/deploy) | `deploy/` |
| Contributor & agent rules | [Contribute](/contribute/) | `AGENTS.md`, `CONTRIBUTING.md` |
| Upstream-only process notes | [Upstream maintainers](/contribute/upstream-maintainers) | `docs/maintainers/` |

When behaviour changes, update the relevant `docs/` (or contracts) in the same pull request as the code. Architecture edits under `docs/architecture/` refresh this site on the next docs workflow run.
