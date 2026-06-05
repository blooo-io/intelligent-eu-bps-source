# INT-244 / TD-13 / REQ-052 — developer API portal (Redocly public OpenAPI).
# Build context: repository root (`docker build -f apps/docs-portal/Dockerfile .`).

FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/docs-portal/package.json apps/docs-portal/
COPY contracts/openapi contracts/openapi
COPY redocly.yaml ./
# Root install so @redocly/cli is available for scripts/build.mjs.
RUN pnpm install --frozen-lockfile
COPY apps/docs-portal apps/docs-portal
RUN pnpm --filter @intelligent/docs-portal build

FROM gcr.io/distroless/nodejs22-debian13:nonroot AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
COPY --from=build --chown=nonroot:nonroot /app/apps/docs-portal/dist ./dist
COPY --from=build --chown=nonroot:nonroot /app/apps/docs-portal/server-dist ./server-dist
USER nonroot
EXPOSE 8080
CMD ["server-dist/main.js"]
