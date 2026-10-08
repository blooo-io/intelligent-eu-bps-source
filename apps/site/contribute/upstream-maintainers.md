# Upstream maintainers

Some files in the repository describe how the **originating consortium partner** operates *their* reference deployment and delivery process (cloud account, DNS zone, internal issue tracker, demo hosts).

That material is useful as a **worked example**. It is **not** mandatory for adopters.

| Topic | Where it lives | For adopters |
|---|---|---|
| Sample GitOps / cluster notes | `docs/release/deployment.md`, `deploy/` | Copy patterns; replace hosts, registries, secrets |
| Internal quality Sonar instance | `docs/release/sonarqube.md` | Optional; use SonarCloud or your own server |
| Delivery process / issue keys | `CONTRIBUTING.md` (maintainer section), `AGENTS.md` | Use your own process; GitHub PRs are enough to contribute |
| Partner freeze / package checklist | `docs/release/FREEZE.md`, `PACKAGE-CONSISTENCY.md` | Ignore unless you consume that release train |
| SemVer tags / GitHub Releases | `docs/release/VERSIONING.md`, `scripts/cut-release.mjs` | Prefer cloning a `vX.Y.Z` tag; optional for forks |

If you are publishing a fork for your member state, energy community or vendor product:

1. Follow [Deploy](/guide/deploy) and [Configuration](/guide/configuration).
2. Keep Apache-2.0 notices and `NOTICE` attributions.
3. Point your users at **your** docs URL; you may reuse this VitePress app (`apps/site`) under the same licence.
