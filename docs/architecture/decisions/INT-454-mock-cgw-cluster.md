---
title: INT-454 — Mock CGW on destinDev (cluster E2E without EWAG)
date: 2026-11-26
---
# Decision: Mock CGW transport on destinDev

## Context

Product needs **live-pod** proof of S1–S14 on `k8s-intelligent-eu-dev`. EWAG topic/role grants for the real DDHub Client Gateway are still pending (`TOPIC::NOT_RELATED_TO_CHANNEL`).

A32 / A8-live keep adapters at `ewds` in deployed envs. Flipping adapters back to in-process `mock` would skip the CGW wire and (for Actor) is refused when `NODE_ENV=production`.

## Decision

1. Deploy **Mock CGW** (`services/mock-cgw`) in `int-apps` on destinDev.
2. Keep `*_ADAPTER=ewds` and `COMMAND_CHANNEL_ENABLED=true`.
3. Point `CGW_BASE_URL` at `http://mock-cgw:8080` (transport substitute).
4. Allow the Mock CGW DID on `EWDS_COMMAND_ALLOWED_DIDS`.
5. Label all evidence `run_path: mock` until EWAG grants enable `live-cgw`.

## Consequences

- Cluster E2E exercises real pods + CGW REST protocol without Spine.
- demo keeps chart `CGW_BASE_URL` → real DDHub (no Mock CGW overlay).
- When EWAG grants land, revert destinDev `CGW_BASE_URL` to DDHub and clear the mock DID allow-list; do not keep both paths silent.
