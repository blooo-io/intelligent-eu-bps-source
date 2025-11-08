# INT-104 / TD-11 — AC-04 trade-intake image.
# Build context: repository root (see deploy/docker/README.md).

FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/module-template/package.json packages/module-template/
COPY mocks/package.json mocks/
COPY services/trade-intake/package.json services/trade-intake/
COPY config ./config
RUN pnpm install --frozen-lockfile --filter @intelligent/trade-intake...
COPY packages/module-template packages/module-template
COPY mocks mocks
COPY services/trade-intake services/trade-intake
RUN pnpm --filter @intelligent/module-template build \
 && pnpm --filter @intelligent/mocks build \
 && pnpm --filter @intelligent/trade-intake build \
 && pnpm --filter @intelligent/trade-intake deploy --prod /out

FROM gcr.io/distroless/nodejs22-debian13:nonroot AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
COPY --from=build --chown=nonroot:nonroot /out ./
USER nonroot
EXPOSE 8080
CMD ["dist/main.js"]
