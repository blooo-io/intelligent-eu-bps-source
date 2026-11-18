---
aside: false
outline: false
title: API reference
---

# API reference

Interactive reference for the public Billing & Payment API (`/v1`), generated from [`contracts/openapi/public.v1.yaml`](https://github.com/blooo-io/intelligent-eu-bps-source/blob/develop/contracts/openapi/public.v1.yaml) with [vitepress-openapi](https://vitepress-openapi.vercel.app/) (INT-302).

- Raw contract: [/openapi/public.v1.yaml](/openapi/public.v1.yaml)
- Narrative notes: [API & events](/reference/api)

## Authentication (get a Bearer token)

Every `/v1` call needs an **OIDC access token** in `Authorization: Bearer …`.

On the upstream sample IdP (Keycloak realm `int`), the public client **`docs`** exposes a **username / password** token endpoint (Resource Owner Password Credentials — INT-403 / INT-404). Use credentials issued to you by an operator — **this page never publishes passwords**. Sample / UAT only — not for production IdPs.

The helper and the IdP are rate-limited (gateway + Keycloak brute-force detection). Failed attempts cool down in the browser as well.

### In-page helper

Enter your IdP username and password, then paste the token into **Try it out → Authorization**.

<ApiTokenHelper />

### curl (same grant)

Replace the placeholders with credentials you already have (never commit them):

```bash
curl -sS -X POST \
  'https://auth.intelligent-eu-bp.blooo.dev/realms/int/protocol/openid-connect/token' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'grant_type=password' \
  -d 'client_id=docs' \
  -d 'username=<username>' \
  -d 'password=<password>' \
  -d 'scope=openid' | jq -r .access_token
```

Then call the API:

```bash
curl -sS 'https://api.dev.intelligent-eu-bp.blooo.dev/v1/me' \
  -H "Authorization: Bearer <access_token>"
```

If the password grant fails on a long-lived cluster, an operator must re-apply the `docs` client with `scripts/keycloak-ensure-uat-users.mjs` (realm ConfigMap import does not update existing clients).

---

Use the sidebar to open each operation, or browse the full spec below.

Playground servers (Try it out / Samples) include the upstream sample gateway `https://api.dev.intelligent-eu-bp.blooo.dev/v1` plus relative `/v1` and `http://localhost/v1`. You can also enter a custom URL.

<OASpec />
