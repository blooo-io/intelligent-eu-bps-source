---
title: "INT-455 — Remove public REST /v1 and reference client"
date: 2026-11-26
status: accepted
---
# INT-455 — Remove public REST `/v1` and reference client

## Decision

The **public OpenAPI `/v1` API** and the **reference client `apps/web` (AC-01)** are **removed**.

External integration with billing is **EWDS-only** (published records + billing command channel). There is no parallel REST product surface.

## What stays

- **Internal** HTTP APIs between Nest modules (`/internal/...`) — module boundaries, not a public product API.
- Payment-provider **webhooks**.
- EWDS Client Gateway adapters, AsyncAPI command channel, topic schemas.

## Spec impact (no renumbering)

| Item | Change |
|---|---|
| REQ-052 | Keep EWDS-only project UI; **withdraw** the sentence that the billing REST API serves a reference web app. |
| REQ-009 | Drop the reference-client `/v1` profile-update branch; project path stays Actor republish only. |
| A27 | Status → **Withdrawn (INT-455)** for the reference-client carve-out; EWDS-only remains. |
| AD-3 / AD-5 / DEV-04 | Marked withdrawn / superseded by INT-455. |

## Rationale

The reference client duplicated the product path, diluted E2E evidence (CI box + `/v1` Playwright vs EWDS), and is unused by R2M. Keeping it had no remaining product value.
