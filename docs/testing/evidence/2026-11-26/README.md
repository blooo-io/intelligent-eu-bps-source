# Evidence pack — 2026-11-26 (Europe/Paris)

## Honest summary

| Path | What it proves | Stripe? |
|---|---|---|
| `mock-cgw-cluster-e2e.json` | Live cluster Mock CGW transport (S1 inject + S13 commands) | **No** |
| `ewds-s01`…`ewds-s14` + `s1-s14-index.json` | Full S1–S14 process I/O on EWDS project path (in-process) | **No** — money paths stubbed |
| `stripe-s04` / `stripe-s08` / `stripe-s10` + `stripe-proof-index.json` | Live **Stripe test mode** API objects for KYC / pay / payout probes | **Yes** (`run_path: stripe-test`) |

**Stripe is not effective inside the EWDS E2E journeys today.** S4/S8/S10 EWDS packs use fixtures/stubs. The `stripe-s*` packs are the separate proof that Stripe test mode works for those capabilities.

## How regenerated

```bash
# S1–S14 input/output dumps
EWDS_EVIDENCE_DIR=$PWD/docs/testing/evidence/2026-11-26 \
  pnpm --filter @intelligent/ewds-project-path-e2e test

# Live Stripe test proofs (needs STRIPE_SECRET_KEY=sk_test_*)
EVIDENCE_DIR=docs/testing/evidence/2026-11-26 \
  node scripts/stripe-scenario-proof.mjs
```

## Index

- [s1-s14-index.json](./s1-s14-index.json) — EWDS scenario matrix
- [stripe-proof-index.json](./stripe-proof-index.json) — Stripe test matrix
- [mock-cgw-cluster-e2e.json](./mock-cgw-cluster-e2e.json) — cluster transport

Jira: INT-458 (this pack), INT-453 / INT-454 (suites).
