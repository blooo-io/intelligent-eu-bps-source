# Adapters & integrations

External systems are reached only through **adapter ports**, selected by environment variables (A8). In code and on chart defaults, everything except the payment provider can run as a **mock** so you can develop and demo without partner backends. Deployed environments switch EWDS adapters live (`deploy/envs/dev|demo`).

## Payment service provider (PSP)

| Mode | When to use |
|---|---|
| Stripe test or live per community | Connect accounts, **direct charges**, payouts, webhooks |
| Mock PSP | Automated tests / offline demos |

Implementations live under `services/payments`. Point webhook endpoints at your public API gateway URL. Billing issues PDF invoices in-house; Stripe does **not** host invoice documents.

## Local market & data space (EWDS)

Trade intake and publication reach GSY DEX / EWDS through **Client Gateway adapters**, selected by environment variables (mock default):

| Adapter | Flag | Role |
|---|---|---|
| Trade source (P-MKT) | `MARKET_ADAPTER` | Settled trades from the local market |
| Publication (P-DS) | `DATASPACE_ADAPTER` | Publish billing records to the data space |
| Actor intake | `ACTOR_SOURCE_ADAPTER` | Participant / manager data from Actor records |
| Erasure intake | `ERASURE_SOURCE_ADAPTER` | GDPR erasure requests |
| Command channel | `COMMAND_CHANNEL_ENABLED` | Project UI request/reply commands |

Ship-with mocks cover scenarios S1–S13 under `mocks/`. The GSY off-chain storage REST adapter is a **test fixture only** — never a production backfill path (A8). Keep message shapes aligned with the [EWDS topic schemas](/architecture/ewds-topics) (and AsyncAPI contracts). See also the [EWDS Client Gateway](/architecture/ewds-client-gateway) note.

## Tariffs

Grid fee, levy and tax amounts come from the **tariff port** (`TARIFF_ADAPTER`, mock or EWDS). While no DSO tariff is published, components are **0** and the invoice carries a short mention (REQ-004).

### Command authorization (three layers)

1. CGW channel role restriction on the billing commands channel.
2. Sender DID allowlist + signature check.
3. Actor role check against the participants registry.

## Identity

The public `/v1` API (reference client `apps/web` only) expects **OIDC bearer tokens**. The project UI does not call `/v1`; it uses EWDS records and the command channel (A7). The reference packaging uses Keycloak realms. Any IdP works if:

- Access tokens validate at the gateway
- Claims used by the services (subject, roles, community) match the [public OpenAPI](https://github.com/blooo-io/intelligent-eu-bps-source/tree/develop/contracts/openapi) assumptions

## FX rates

Reference-data can use ECB feed adapters or fixtures for CHF communities. Swap the HTTP client configuration without changing settlement rules.

## Building your own adapter

1. Keep the **port interface** in the NestJS module.
2. Add a new adapter class selected by configuration.
3. Cover it with unit tests; do not put credentials in the repository.
4. Update contracts only if the **external** observable API changes (usually it should not).
