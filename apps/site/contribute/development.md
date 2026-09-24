# Development

## Toolchain

- Node ≥ 22, pnpm 9
- TypeScript, NestJS (services), React / Refine (`apps/web`)
- Vitest for unit tests; Playwright e2e targets a **deployed** environment (not PR unit CI)

## Useful commands

```bash
pnpm install
pnpm run contracts:lint
pnpm test
pnpm --filter @intelligent/site dev    # this documentation site
pnpm --filter @intelligent/site build
```

## Contract-first loop

1. Change `contracts/openapi` or `contracts/asyncapi`.
2. Lint / mock with Prism.
3. Implement the NestJS module with request/response validation enabled.
4. Add tests that name the `REQ-xxx` / `UAT-xxx` they cover when applicable.

## Local docs site

```bash
cd apps/site
pnpm dev
```

Open the printed localhost URL. Production builds are static and published to GitHub Pages (see `.github/workflows/docs.yml`).
