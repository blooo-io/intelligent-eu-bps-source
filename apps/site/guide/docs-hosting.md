# Docs hosting & URL

The VitePress site (including the embedded Redoc API) is published with the `docs` GitHub Actions workflow.

## Default private URL

While the repository is **private**, GitHub Pages assigns a random host such as:

`https://<random>.pages.github.io/`

That prefix is **not configurable**. Collaborators with repo access open it after GitHub login.

## Friendlier URL options

### 1. Custom domain (recommended while the repo stays private)

1. Choose a hostname you control, e.g. `billing-docs.example.org` or `docs.your-energy-community.eu`.
2. In the repo: **Settings → Pages → Custom domain** — enter that hostname and follow GitHub’s DNS instructions (usually a `CNAME` to `<org>.github.io` or the Pages target GitHub shows).
3. Optionally add a `CNAME` file under `apps/site/public/CNAME` containing only that hostname so it ships with every build (adopters fork and replace with their own).
4. Enable **Enforce HTTPS** once the certificate is ready.

After DNS propagates, use your domain instead of `*.pages.github.io`. The private-access model (login with repo rights) still applies until the site or repo is public.

### 2. Public project Pages URL

If the repository (or Pages visibility) becomes **public**, GitHub serves:

`https://<org>.github.io/intelligent-eu-bps-source/`

Then set `DOCS_BASE=/intelligent-eu-bps-source/` in `.github/workflows/docs.yml` so asset paths match that prefix.

### 3. Host elsewhere

Build with `pnpm --filter @intelligent/site build` and publish `apps/site/.vitepress/dist` to any static host (Netlify, Cloudflare Pages, S3, …) under a path of your choice. Set `DOCS_BASE` to that path (or `/` for a dedicated subdomain).

## What this site includes

| Path | Content |
|---|---|
| `/` | Guides (VitePress) |
| `/api/` | Interactive OpenAPI ([vitepress-openapi](https://vitepress-openapi.vercel.app/), from `public.v1.yaml`) |
| `/api/operations/<operationId>` | One page per operation |
| `/openapi/public.v1.yaml` | Raw public contract |

