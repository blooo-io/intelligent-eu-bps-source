# Docs hosting & URL

The VitePress site (including the embedded OpenAPI UI) is published with the `docs` GitHub Actions workflow.

## Upstream URL (Blooo)

Canonical public URL:

`https://docs.blooo.dev/intelligent-eu-bps-source/`

- Custom domain: `docs.blooo.dev` (CNAME → `blooo-io.github.io`, DNS only).
- Path prefix: `/intelligent-eu-bps-source/` (`DOCS_BASE` in `.github/workflows/docs.yml`).
- Packaging (INT-401): after the VitePress build, `scripts/package-pages.mjs` nests the dist under that prefix inside the Pages artifact, writes a root redirect, and ships a root `CNAME`. Without nesting, a custom domain would serve files at `/` while HTML still requested `/intelligent-eu-bps-source/assets/…` → 404.

`https://docs.blooo.dev/` redirects to the path above.

## Default private URL

While the repository is **private**, GitHub Pages may also expose a random host such as:

`https://<random>.pages.github.io/`

That prefix is **not configurable**. Collaborators with repo access open it after GitHub login.

## Friendlier URL options (adopters)

### 1. Custom domain with the same path prefix

1. Choose a hostname you control, e.g. `docs.your-energy-community.eu`.
2. In the repo: **Settings → Pages → Custom domain** — enter that hostname and follow GitHub’s DNS instructions (usually a `CNAME` to `<org>.github.io`).
3. Keep `DOCS_BASE=/intelligent-eu-bps-source/` (or your preferred prefix) and set `DOCS_CUSTOM_DOMAIN` in the workflow so `pages:package` writes your `CNAME`.
4. Enable **Enforce HTTPS** once the certificate is ready.

### 2. Public project Pages URL (no custom domain)

If you rely only on GitHub’s project URL:

`https://<org>.github.io/intelligent-eu-bps-source/`

GitHub already mounts the artifact under `/<repo>/`. In that case you can upload `.vitepress/dist` directly **or** keep the nested packaging (the extra folder becomes `/<repo>/<prefix>/` — use one scheme consistently).

### 3. Host elsewhere

Build with `pnpm --filter @intelligent/site build` and publish `apps/site/.vitepress/dist` (or the packaged `pages-dist`) to any static host under a path of your choice. Set `DOCS_BASE` to that path (or `/` for a dedicated subdomain at the root).

## What this site includes

| Path | Content |
|---|---|
| `/intelligent-eu-bps-source/` | Guides (VitePress) |
| `/intelligent-eu-bps-source/api/` | Interactive OpenAPI ([vitepress-openapi](https://vitepress-openapi.vercel.app/), from `public.v1.yaml`) |
| `/intelligent-eu-bps-source/api/operations/<operationId>` | One page per operation |
| `/intelligent-eu-bps-source/openapi/public.v1.yaml` | Raw public contract |
