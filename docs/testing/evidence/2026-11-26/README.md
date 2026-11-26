# Evidence pack — 2026-11-26 (Europe/Paris)

## Honest summary

| Path | What it proves | Stripe? |
|---|---|---|
| `mock-cgw-cluster-e2e.json` | Live cluster Mock CGW transport (S1 inject + S13 commands) | **No** |
| `ewds-s01`…`ewds-s14` + `s1-s14-index.json` | Full S1–S14 process I/O on EWDS project path (in-process) | **No** — money paths stubbed |
| `stripe-s04` / `stripe-s08` / `stripe-s10` + `stripe-proof-index.json` | Live **Stripe test mode** API objects (script-level) | **Yes** |
| `cluster-money-path/*-ci/` (INT-461 / INT-462) | destinDev money-path via `money-path-stripe-dev` CI | **Yes** — S8 Paid, S9 fail+reminder, S10 `po_*` |

**Stripe on the cluster:** Connect + pay + decline reminder + payout are CI-proven (`run_path: stripe-test`). EWDS journey stubs remain separate (`run_path: mock`).

## How regenerated

```bash
# S1–S14 input/output dumps
EWDS_EVIDENCE_DIR=$PWD/docs/testing/evidence/2026-11-26 \
  pnpm --filter @intelligent/ewds-project-path-e2e test

# Live Stripe test proofs (needs STRIPE_SECRET_KEY=sk_test_*)
EVIDENCE_DIR=docs/testing/evidence/2026-11-26 \
  node scripts/stripe-scenario-proof.mjs

# Cluster money-path (CI): artifact money-path-stripe-evidence from money-path-stripe-dev
```

## Index

- [s1-s14-index.json](./s1-s14-index.json) — EWDS scenario matrix
- [stripe-proof-index.json](./stripe-proof-index.json) — Stripe test matrix
- [mock-cgw-cluster-e2e.json](./mock-cgw-cluster-e2e.json) — cluster transport
- [cluster-money-path/](./cluster-money-path/) — destinDev money-path (`*-ci/` = CI source of truth)

Jira: INT-458 (EWDS packs), INT-459…461 (money-path), INT-462 (CI archive + doc debts).
