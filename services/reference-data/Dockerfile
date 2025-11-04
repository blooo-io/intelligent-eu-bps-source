# INT-102 / TD-11 — AC-13 reference-data image.
# Build context: repository root (see deploy/docker/README.md).
# Use `pnpm deploy --prod` so Trivy does not scan the whole monorepo node_modules.

FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/module-template/package.json packages/module-template/
COPY mocks/package.json mocks/
COPY services/reference-data/package.json services/reference-data/
COPY config ./config
RUN pnpm install --frozen-lockfile --filter @intelligent/reference-data...
COPY packages/module-template packages/module-template
COPY mocks mocks
COPY services/reference-data services/reference-data
RUN pnpm --filter @intelligent/module-template build \
 && pnpm --filter @intelligent/mocks build \
 && pnpm --filter @intelligent/reference-data build \
 && pnpm --filter @intelligent/reference-data deploy --prod /out

FROM gcr.io/distroless/nodejs22-debian13:nonroot AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
COPY --from=build --chown=nonroot:nonroot /out ./
USER nonroot
EXPOSE 8080
CMD ["dist/main.js"]
