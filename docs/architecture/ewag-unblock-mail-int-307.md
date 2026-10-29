# EWAG unblock mail — Blooo Client Gateway (INT-307)

Status: **DRAFT ready to send** (2026-10-29). Owner: Blooo (T5.6 / D5.5 Billing & Payment). Parent: [INT-306](https://blooo-io.atlassian.net/browse/INT-306).

> **Purpose:** ask EWAG only for what the [Energy Web docs](https://docs.energyweb.org/energy-solutions/digital-spine-by-energy-web/component-guides/ddhub-client-gateway/deployment-guide/preparing-to-set-up-a-client-gateway) require from them — **CSR signing**, **outbound IP whitelist**, **EWT faucet (≥ 1 EWT)**, and **Message Broker user-role enrolment** — so we can move Onboarded → **Configured** → **Verified**. Phase 1 GitOps packaging is already in our EU cluster (INT-308); mocks remain the V1 default until Verified (A32).

Related plan: [`ewds-client-gateway.md`](ewds-client-gateway.md). Topic schemas: [`ewds-topics/`](ewds-topics/README.md). Operator notes: [`../release/ddhub-client-gateway.md`](../release/ddhub-client-gateway.md).

Official references:

- [Preparing to set up](https://docs.energyweb.org/energy-solutions/digital-spine-by-energy-web/component-guides/ddhub-client-gateway/deployment-guide/preparing-to-set-up-a-client-gateway) — EWC account + ≥ 1 EWT, mTLS cert from EWF, enterprise user roles
- [Configure mTLS](https://docs.energyweb.org/energy-solutions/digital-spine-by-energy-web/component-guides/ddhub-client-gateway/deployment-guide/post-deployment/configure-mtls) — participant sends **CSR**, EWF issues client cert, outbound IP whitelisted

---

## Mail — copy / paste

**To:** EWAG / Energy Web onboarding contact for project INTELLIGENT  
**Cc:** Blooo project lead (T5.6)  
**Subject:** INTELLIGENT / Blooo — Client Gateway: CSR + EWT faucet + whitelist  
**Attachment:** `blooo-cg-mtls.csr` (generate with the operator command below — never attach the private key)

```text
Hello EWAG team,

We are Blooo, delivering the Billing & Payment Service for Horizon Europe
INTELLIGENT (T5.6 / D5.5).

EWAG status for our organisation (May 2026 report): Onboarded = yes,
Configured = no, Verified = no. Our DDHub Client Gateway is packaged in
our EU Kubernetes environment (Scaleway nl-ams, GitOps) and is ready for
enrolment against https://ddhub-ewc.energyweb.org.

Per the Energy Web Client Gateway docs (preparing-to-set-up +
configure-mtls), please:

1) Sign our mTLS CSR
   CSR attached: blooo-cg-mtls.csr
   Subject: CN=Blooo Billing Client Gateway, O=Blooo,
            OU=INTELLIGENT Billing, C=FR
   Please return the EWF-signed client certificate for Message Broker
   mTLS (file or portal) and confirm turnaround.

2) Whitelist our outbound IPs
   Cluster egress today uses each Kapsule node ExternalIP (no dedicated
   NAT). Please whitelist:
   - 51.15.34.84
   - 51.15.34.86
   - 51.15.126.180
   We will notify you if a node rotate changes this set.

3) EWT faucet
   Please provide faucet access (or an equivalent transfer) so we can
   fund our EWC wallet with at least 1 EWT and record the Gateway DID.

4) Enterprise user roles
   Please enrol / approve the Message Broker user roles for our Gateway
   DID (Message Broker user, topiccreator; GSY subscriber roles when
   available for INTELLIGENT).

We will handle the rest on our side (system/API mode, vault-held API
keys, topic registration, retention). Happy to jump on a short call
if that is faster.

Thank you,
Blooo — INTELLIGENT Billing & Payment (T5.6)
```

---

## Generate the CSR (operator laptop — do **not** commit the key)

Run outside the repository (e.g. `~/secrets/intelligent-ewds/`). Keep `blooo-cg-mtls.key` in OpenBao / operator secret store only.

```bash
mkdir -p ~/secrets/intelligent-ewds && cd ~/secrets/intelligent-ewds

openssl genrsa -out blooo-cg-mtls.key 4096

openssl req -new -key blooo-cg-mtls.key -out blooo-cg-mtls.csr \
  -subj "/C=FR/O=Blooo/OU=INTELLIGENT Billing/CN=Blooo Billing Client Gateway"

# Optional sanity check (public CSR only — safe to share)
openssl req -in blooo-cg-mtls.csr -noout -subject -pubkey
```

Attach **only** `blooo-cg-mtls.csr` to the mail. After EWF returns the signed cert, configure it on the CG via `POST /api/v2/certificate` (INT-309) — private key stays local / in OpenBao.

### Egress IPs (measured 2026-10-29, `k8s-intelligent-eu-dev`)

| Node | ExternalIP | Notes |
|---|---|---|
| `…ae3cea` | `51.15.34.84` | Current CG API + scheduler node |
| `…77116e` | `51.15.34.86` | Pool peer |
| `…3f466c` | `51.15.126.180` | Pool peer |

Re-check before send:

```bash
kubectl get nodes -o jsonpath='{range .items[*]}{.status.addresses[?(@.type=="ExternalIP")].address}{"\n"}{end}'
kubectl -n ddhub exec deploy/ddhub-client-gateway -c api -- wget -qO- https://api.ipify.org; echo
```

---

## Answers tracker (fill as EWAG replies)

| # | Topic | Blooo action | EWAG answer | Date | Blocks |
|---|---|---|---|---|---|
| 1 | CSR → EWF mTLS cert | Generate CSR; attach to mail | | | INT-309 |
| 2 | Outbound IP whitelist | Send the three node ExternalIPs above | | | INT-309 |
| 3 | EWT faucet (≥ 1 EWT) | Create EWC wallet; receive faucet | | | INT-309 |
| 4 | MB user roles / enrolment | Bind roles to Gateway DID | | | INT-309 |

---

## Blooo-side (do **not** ask EWAG)

These are already decided or owned by us; keep them out of the mail:

| Topic | Blooo default |
|---|---|
| Transport | REST short polling; Helm `websocket: NONE` |
| Mode | System / API only (no public UI) |
| API auth | Enable `x-api-key`; mint / rotate in OpenBao |
| Topics / schemas | Register `billingInvoice` / `billingPayment` from [`ewds-topics/`](ewds-topics/); dialect per EW portal |
| Retention | Purge after ingest; hard max 7 days (REQ-053 / A26) |
| Egress NetworkPolicies | Tighten once whitelist FQDNs/IPs are known |

---

## Internal send checklist (Blooo)

- [ ] Confirm EWAG recipient(s) with project coordinator / Energy Web contact sheet
- [ ] Generate CSR with the openssl commands above; store key outside Git
- [ ] Re-check node ExternalIPs; update the mail body if they changed
- [ ] Attach `blooo-cg-mtls.csr` only; send mail; paste Message-ID / date into INT-307 comment
- [ ] Update the answers table above as replies arrive
- [ ] When cert + faucet + roles land: comment INT-306 / INT-309 and complete enrolment
- [ ] When Verified: unlock INT-311 live adapter flag work (mock stays default until then)

## Out of scope for this mail

- Ad-hoc `helm install` of CG outside GitOps (INT-157)
- Cutting over P-DS / P-MKT off mocks before Verified (A32)
- Publishing personal data or Stripe identifiers on EWDS topics
- Committing `blooo-cg-mtls.key` (or any private key) to Git
