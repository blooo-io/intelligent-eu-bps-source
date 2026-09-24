# Source documentation

Detailed markdown in the Git repository remains the **specification source of truth**. This VitePress site is the **operator-facing** entry point.

| Area | Location |
|---|---|
| Requirements, personas, UAT | `docs/requirements/` |
| Architecture views 01–05 | `docs/architecture/` |
| Testing & validation evidence | `docs/testing/` |
| Release / freeze notes | `docs/release/` |
| OpenAPI / AsyncAPI | `contracts/` |
| Deploy charts | `deploy/` |
| Contributor & agent rules | `AGENTS.md`, `CONTRIBUTING.md` |
| Upstream-only process notes | `docs/maintainers/` |

When behaviour changes, update the relevant `docs/` (or contracts) in the same pull request as the code.
