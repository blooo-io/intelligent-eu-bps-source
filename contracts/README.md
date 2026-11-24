# contracts/

API-first, contract-first (TP-8 / TD-13). Every contract is written and reviewed **before** its implementation.

- `openapi/`: OpenAPI 3.1.
  - `public.v1.yaml`: the public API exposed by APISIX under `/v1` for the **reference client (`apps/web`) only** (A7 / REQ-052); the project UI uses EWDS records + the command channel.
  - `internal/<module>.v1.yaml`: internal module-to-module APIs (03 §3.2). The paths are the HTTP mapping of the named commands (ResolveParty, GetUnbilledTrades, and the others). Each call requires a Keycloak service token (04 §7).
  - `webhooks/payment-provider.v1.yaml`: inbound provider webhook. The body stays opaque; the `Stripe-Signature` header is the credential (NFR-015).
- `asyncapi/`: AsyncAPI 3.0 for the domain events (03 §4). The common envelope is `asyncapi/components/envelope.schema.json`. Channel addresses are the event names. Payloads carry identifiers only. AC-11 consume contract: `asyncapi/notification.v1.yaml` (INT-209).
- **EWDS messages:** `docs/architecture/ewds-topics/` (statement, invoice, payment, payout, KYC status, command request/reply), proposed to EWAG. Real adapters are selected by env flags (`MARKET_ADAPTER`, `DATASPACE_ADAPTER`, …); GSY off-chain REST is a test fixture only (A8).

**Tooling (TD-13):**

```bash
pnpm contracts:lint   # Spectral, Redocly, AsyncAPI CLI
pnpm contracts:mock   # Prism serves the public API
```

CI lints both contracts and runs oasdiff once a public contract exists on `develop`. A breaking change needs `/v2`.

openapi-typescript, Orval, express-openapi-validator and Schemathesis start with the module template and the first service (workflow steps 3 to 5 in technical architecture §3.3). They need a running module, which this contract does not include.
