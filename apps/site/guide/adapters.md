# Adapters & integrations

External systems are reached only through **adapter ports**. In V1, everything except the payment provider can run as a **mock** so you can develop and demo without partner backends.

## Payment service provider (PSP)

| Mode | When to use |
|---|---|
| Stripe test mode | Default V1 path — Connect onboarding, Invoicing, webhooks |
| Mock PSP | Automated tests / offline demos |

Implementations live under `services/payments` and `services/invoicing`. Point webhook endpoints at your public API gateway URL.

## Local market & data space

Trade intake and publication talk to GSY DEX / EWDS through adapters. Ship-with mocks cover scenarios S1–S13 under `mocks/`. Replace with your Client Gateway when ready; keep message shapes aligned with `docs/architecture/ewds-topics/` and AsyncAPI contracts.

## Identity

The public API expects **OIDC bearer tokens**. The reference packaging uses Keycloak realms. Any IdP works if:

- Access tokens validate at the gateway
- Claims used by the services (subject, roles, community) match the [public OpenAPI](https://github.com/blooo-io/intelligent-eu-bps-source/tree/develop/contracts/openapi) assumptions

## FX rates

Reference-data can use ECB feed adapters or fixtures for CHF communities. Swap the HTTP client configuration without changing settlement rules.

## Building your own adapter

1. Keep the **port interface** in the NestJS module.
2. Add a new adapter class selected by configuration.
3. Cover it with unit tests; do not put credentials in the repository.
4. Update contracts only if the **external** observable API changes (usually it should not).
