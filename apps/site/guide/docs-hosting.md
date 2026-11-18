# Docs hosting & URL

The VitePress site (including the embedded OpenAPI UI) is published with the `docs` GitHub Actions workflow.

## Upstream URL (Blooo)

Canonical public URL:

`https://intelligent.docs.blooo.dev/`

- Custom domain: `intelligent.docs.blooo.dev` (CNAME → `blooo-io.github.io`, DNS only).
- Path: site root (`DOCS_BASE=/` in `.github/workflows/docs.yml`).
- Packaging (INT-401): `scripts/package-pages.mjs` copies the VitePress dist into the Pages artifact and writes a root `CNAME`.

### DNS (Cloudflare)

On the `blooo.dev` zone, add:

| Type | Name | Content | Proxy |
|---|---|---|---|
| CNAME | `intelligent.docs` | `blooo-io.github.io` | DNS only |

In the GitHub repo: **Settings → Pages → Custom domain** = `intelligent.docs.blooo.dev`, then **Enforce HTTPS** once the certificate is issued.

## Default private URL

While the repository is **private**, GitHub Pages may also expose a random host such as:

`https://<random>.pages.github.io/`

That prefix is **not configurable**. Collaborators with repo access open it after GitHub login.

## Friendlier URL options (adopters)

### 1. Custom domain at the site root (recommended)

1. Choose a hostname you control, e.g. `docs.your-energy-community.eu`.
2. In the repo: **Settings → Pages → Custom domain** — enter that hostname and follow GitHub’s DNS instructions (usually a `CNAME` to `<org>.github.io`).
3. Keep `DOCS_BASE=/` and set `DOCS_CUSTOM_DOMAIN` in the workflow so `pages:package` writes your `CNAME`.
4. Enable **Enforce HTTPS** once the certificate is ready.

### 2. Public project Pages URL (no custom domain)

If you rely only on GitHub’s project URL:

`https://<org>.github.io/<repo>/`

Set `DOCS_BASE=/<repo>/` so asset paths match that prefix. With a path base, `pages:package` nests the build under that folder when you also use a custom domain.

### 3. Host elsewhere

Build with `pnpm --filter @intelligent/site build` and publish `apps/site/.vitepress/dist` (or the packaged `pages-dist`) to any static host under a path of your choice. Set `DOCS_BASE` to that path (or `/` for a dedicated subdomain).

## What this site includes

| Path | Content |
|---|---|
| `/` | Guides (VitePress) |
| `/api/` | Interactive OpenAPI ([vitepress-openapi](https://vitepress-openapi.vercel.app/), from `public.v1.yaml`) |
| `/api/operations/<operationId>` | One page per operation |
| `/openapi/public.v1.yaml` | Raw public contract |
