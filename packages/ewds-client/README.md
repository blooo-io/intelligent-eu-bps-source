# @intelligent/ewds-client

DDHub Client Gateway (CGW) REST client, request/reply correlation, durable inbound store, JSON Schema validation, and adapter-mode configuration for INTELLIGENT billing (INT-423, NFR-017).

## CGW snapshot

`test/cgw-openapi.snapshot.json` pins the REST paths this client calls. Refresh from a running gateway:

```bash
kubectl port-forward -n ddhub svc/ddhub-client-gateway 3333:80
curl -sS http://127.0.0.1:3333/docs-json -o packages/ewds-client/test/cgw-openapi.snapshot.json
```

Set `info.x-captured-from` to the deployed chart tag (e.g. `intelligent-canary`, chart `1.3.0-ewc`).

## Acknowledgements

When `/api/v2/messages/ack` is absent from the pinned OpenAPI snapshot, `CgwClient.ack()` is a **no-op** (cursor advances on `GET /messages` only). Set `CGW_ACK_MODE=fetch` to document that durability must rely on persisting inbound messages before processing (Task 4.6).

## Secrets

Never commit API keys. `loadCgwConfig` reads `CGW_API_KEY` from the environment (OpenBao / External Secrets in cluster).