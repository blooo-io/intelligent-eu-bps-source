# contracts/

API-first, contract-first (TP-8 / TD-13). Every contract is written and reviewed **before** its implementation.

- `openapi/`: OpenAPI 3.1.
  - `public.v1.yaml`: the public API exposed by APISIX under `/v1`, built from the resources of 03 §3.1.
  - `internal/<module>.v1.yaml`: internal module-to-module APIs (03 §3.2).
- `asyncapi/`: AsyncAPI 3 for the domain events (03 §4), with the common envelope.
- **EWDS messages:** `docs/architecture/ewds-topics/` (billingInvoice, billingPayment), proposed to EWAG.

**Tooling:**
- Spectral and Redocly CLI (lint and documentation);
- oasdiff (breaking-change detection);
- Prism (mock server);
- openapi-typescript and Orval (types and clients);
- Schemathesis (contract tests);
- AsyncAPI CLI.
