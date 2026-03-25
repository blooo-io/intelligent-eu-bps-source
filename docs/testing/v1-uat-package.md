# V1 UAT package (INT-79)

Assemble acceptance for partners from the existing UAT notes. **Case text stays in** [`docs/requirements/items/uat/`](../requirements/items/uat/). This package only lists what to run, who runs it, and where evidence goes.

## Package contents

| Item | Location |
|---|---|
| Test plan | [`v1-test-plan.md`](v1-test-plan.md) |
| Confirmed functional set | [`v1-functional-cases.md`](v1-functional-cases.md) (62 `scope_d55: in` notes) |
| Integration scenarios S1–S13 | [`v1-integration-scenarios.md`](v1-integration-scenarios.md) |
| Integration execution | [`v1-integration-execution.md`](v1-integration-execution.md) |
| Functional execution | [`v1-functional-execution.md`](v1-functional-execution.md) |
| Unit/component coverage | [`v1-unit-component-evidence.md`](v1-unit-component-evidence.md) |
| Live environment | `dev` / `int` hosts under `*.intelligent-eu-bp.blooo.dev` (Stripe **test** mode) |

## Participants (who runs what)

| Role | Responsibility | Confirmed |
|---|---|---|
| Blooo engineering (agent / developer) | Module suites, GitOps smoke, record Pass/Fail/Blocked in UAT notes | Yes — INT-75 / INT-78 |
| Blooo operator / agent | Authenticated portal checks on `dev` with Keycloak UAT users (INT-194) | Yes — see table below |
| Pilot / partner UAT lead | Optional: UX step counts (NFR-016 / UAT-067); performance window (NFR-008 / UAT-040) | Criteria TBD or waive |
| Steven Lin (assignee) | Owns recording acceptance in Jira INT-80 | Yes |

## Already accepted (do not re-run unless regressing)

See the Pass rows in [`v1-functional-cases.md`](v1-functional-cases.md) and the two execution logs. After INT-204 (2026-10-18): **62 Pass**, **0 Blocked** in-scope, **0 Fail**. UAT-040 Pass (duration deferred). UAT-053 Pass. UAT-050 Pass. UAT-028 / UAT-015 / UAT-067 / UAT-051 Pass; UAT-044 / UAT-047 out.

## Keycloak UAT IdP users (INT-194)

Packed in `deploy/charts/keycloak-realms/realms/int-realm.json` (V1 `dev`/`int` placeholders — same class as client secret `dev-only-replace-me`; never production). Community attribute: `a1000000-0000-4000-8000-000000000001`.

| Role | Username | Password |
|---|---|---|
| member | `uat-member` | `Intelligent-UAT-2026!` |
| manager | `uat-manager` | `Intelligent-UAT-2026!` |
| operator | `uat-operator` | `Intelligent-UAT-2026!` |

ConfigMap sync alone does not re-import users on an already-initialised realm. After deploy, ensure passwords with:

```bash
kubectl -n keycloak port-forward svc/platform-keycloak-keycloakx-http 18082:80
KEYCLOAK_URL=http://127.0.0.1:18082 \
KEYCLOAK_ADMIN_PASSWORD="$(kubectl -n keycloak get secret keycloak-admin -o jsonpath='{.data.password}' | base64 -d)" \
node scripts/keycloak-ensure-uat-users.mjs
```

## Remaining Blocked cases (in-scope)

None. All 62 in-scope UATs are Pass (UAT-044 / UAT-047 out of scope).

UAT-040 **Pass** (INT-204): S1 billing run ~527 ms on `dev`; agreed pilot SLA deferred (NFR-008).

UAT-053 **Pass** (INT-203): `BDEMQ4VL-0010/0011` and `QAIDHPRM-0003/0004` on distinct Connect accounts; EWDS uses `invoiceId` only.

UAT-050 **Pass** (INT-202): Connect invoices `BDEMQ4VL-0008` / `0009` totals 200 / 264 match AC-06; self-billing footer + trade summary on PDF.

UAT-028 **Pass** (INT-200): see [`uat028-operator-trace.md`](uat028-operator-trace.md).

UAT-015 **Pass** (INT-195): Connect `charges_enabled` + destination transfer + payout. See [`stripe-connect-test-kyc.md`](stripe-connect-test-kyc.md).

## How to record a result (INT-80)

1. Open the UAT note under `docs/requirements/items/uat/`.
2. Set `status` to `Pass`, `Fail` or `Blocked`; set `last_run` and `tester`.
3. Append a short run note (no personal data).
4. Failures that block freeze go to INT-82.

## Confirmation checklist

- [x] Package points at docs notes only (no duplicated Given/When/Then)
- [x] Runners identified
- [x] Remaining set listed for INT-80
- [ ] Pilot / partner UAT lead named (human confirmation)
