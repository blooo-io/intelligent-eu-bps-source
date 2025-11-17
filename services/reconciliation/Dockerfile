# INT-108 / TD-11 — AC-08 reconciliation image.

FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/module-template/package.json packages/module-template/
COPY services/reconciliation/package.json services/reconciliation/
COPY config ./config
RUN pnpm install --frozen-lockfile --filter @intelligent/reconciliation...
COPY packages/module-template packages/module-template
COPY services/reconciliation services/reconciliation
RUN pnpm --filter @intelligent/module-template build \
 && pnpm --filter @intelligent/reconciliation build \
 && pnpm --filter @intelligent/reconciliation deploy --prod /out

FROM gcr.io/distroless/nodejs22-debian13:nonroot AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
COPY --from=build --chown=nonroot:nonroot /out ./
USER nonroot
EXPOSE 8080
CMD ["dist/main.js"]
