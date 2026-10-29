# EWAG unblock mail — Blooo Client Gateway (INT-307)

Status: **DRAFT ready to send** (2026-10-29). Owner: Blooo (T5.6 / D5.5 Billing & Payment). Parent: [INT-306](https://blooo-io.atlassian.net/browse/INT-306).

> **Purpose:** move EWAG status from Onboarded → **Configured** → **Verified** so Blooo can complete enrolment (INT-309) and live Digital Spine adapters (INT-311). Phase 1 GitOps packaging is already in our EU cluster (INT-308); mocks remain the V1 default until Verified (A32).

Related plan: [`ewds-client-gateway.md`](ewds-client-gateway.md). Topic schemas: [`ewds-topics/`](ewds-topics/README.md). Operator notes: [`../release/ddhub-client-gateway.md`](../release/ddhub-client-gateway.md).

---

## Mail — copy / paste

**To:** EWAG / Energy Web onboarding contact for project INTELLIGENT  
**Cc:** Blooo project lead (T5.6)  
**Subject:** INTELLIGENT / Blooo — Client Gateway unblock (Configured + Verified)

```text
Hello EWAG team,

We are Blooo, delivering the Billing & Payment Service for Horizon Europe
INTELLIGENT (T5.6 / D5.5).

EWAG status for our organisation (May 2026 report): Onboarded = yes,
Configured = no, Verified = no. We have packaged our own DDHub Client
Gateway in our EU Kubernetes environment (Scaleway nl-ams, GitOps) and
are ready for enrolment. We need your confirmation on the points below
so we can proceed to Configured and Verified.

Context (our side)
- One dedicated Client Gateway for Billing & Payment (NFR-017); not a
  shared instance.
- Integration mode: system/API only (no public UI). REST with x-api-key.
- Message Broker target: https://ddhub-ewc.energyweb.org
- Secrets / DID keys: OpenBao (Vault-compatible) in-cluster.
- Draft topic schemas already proposed for billingInvoice and
  billingPayment (JSON Schema 2020-12, also valid as draft-07):
  see the INTELLIGENT repo docs/architecture/ewds-topics/.

Please confirm or correct:

1) Transport
   We propose REST short polling for NestJS workers
   (Helm websocket: NONE). Do you require WebSocket
   (SERVER/CLIENT, ddhub-protocol) instead?

2) API authentication
   Auth strategies are off by default in the CG. Please confirm the
   supported way to enable API auth and to mint / rotate x-api-key
   values for a system client (no OIDC federation with our IdP).

3) mTLS / CSR
   What is the current CSR → EWF-signed certificate process and
   turnaround for Message Broker mTLS? Any template or portal link?

4) DID / wallet / VCs
   Please confirm:
   - minimum EWT on the EWC wallet for Gateway DID,
   - which Verifiable Credentials we must hold (Message Broker user,
     topiccreator, and any GSY subscriber roles),
   - how roles are bound to our Gateway DID.

5) Topics and schema dialect
   a) Owner namespace / channel names for:
      - billingInvoice / billingPayment (publisher: Blooo CG)
      - GSY tradesQuery / clearingResultsQuery / marketsQuery channels
        (subscriber: Blooo CG) — assumption A12 still open on our side.
   b) Register schemas as JSON Schema 2020-12 or draft-07 (JSD7)?
      Both validate on our drafts; we will register what you require.

6) Retention / purge
   REQ-053 / A26: Billing will persist inbound payloads and purge after
   ingest, hard max 7 days. Please confirm CG scheduler
   CLEANUP_MESSAGES_CRON_* defaults are compatible, or give required
   cron values.

7) Egress allow-list
   Please provide the authoritative FQDN (or IP) list for:
   - Message Broker (ddhub-ewc),
   - EWC RPC / identity cache,
   - any other hosts the CG must reach for enrolment and runtime.
   We will tighten NetworkPolicies accordingly.

8) Path to Configured / Verified
   What checklist or evidence do you need from us after CSR + VCs +
   topic registration to mark Configured and then Verified?

We are available for a short call if that is faster. Happy to attach
our draft schemas or a CSR once you confirm the process.

Thank you,
Blooo — INTELLIGENT Billing & Payment (T5.6)
```

---

## Answers tracker (fill as EWAG replies)

| # | Topic | Blooo proposal | EWAG answer | Date | Blocks |
|---|---|---|---|---|---|
| 1 | Transport | REST short polling, `websocket: NONE` | | | INT-309 / INT-311 |
| 2 | API auth / `x-api-key` mint | Enable API auth; keys in OpenBao only | | | INT-309 |
| 3 | mTLS CSR process | Follow EW post-deploy mTLS guide | | | INT-309 |
| 4 | DID / EWT / VCs | ≥1 EWT; MB user + topiccreator (+ GSY roles) | | | INT-309 |
| 5a | Topic owner / channels | `integration.apps.intelligent.auth.ewc`; see ewds-topics | | | INT-309 / A12 |
| 5b | Schema dialect | Either 2020-12 or draft-07 | | | INT-309 |
| 6 | Retention / cleanup cron | Purge after ingest; max 7 days | | | INT-310 |
| 7 | Egress FQDNs | Broker + RPC + identitycache | | | INT-308 harden / INT-309 |
| 8 | Configured → Verified checklist | TBD by EWAG | | | INT-306 gate |

---

## Internal send checklist (Blooo)

- [ ] Confirm EWAG recipient(s) with project coordinator / Energy Web contact sheet
- [ ] Attach or link `ewds-topics/` schemas + examples (optional on first mail)
- [ ] Send mail; paste Message-ID / date into INT-307 comment
- [ ] Update the answers table above as replies arrive
- [ ] When Configured: comment INT-306 / INT-309 and start CSR + VC enrolment
- [ ] When Verified: unlock INT-311 live adapter flag work (mock stays default until then)

## Out of scope for this mail

- Ad-hoc `helm install` of CG outside GitOps (INT-157)
- Cutting over P-DS / P-MKT off mocks before Verified (A32)
- Publishing personal data or Stripe identifiers on EWDS topics
