# INT-137 / TD-5 / TD-11 — AC-01 Refine web app image.
# Build context: repository root (`docker build -f apps/web/Dockerfile .`).
# Runtime is a zero-dependency Node static server (distroless) + Vite SPA.

FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/
COPY config ./config
RUN pnpm install --frozen-lockfile --filter @intelligent/web...
COPY apps/web apps/web
RUN pnpm --filter @intelligent/web build

FROM gcr.io/distroless/nodejs22-debian13:nonroot AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV OIDC_AUTHORITY=https://auth.intelligent-eu-bp.blooo.dev/realms/int
ENV OIDC_CLIENT_ID=web
ENV API_BASE_URL=https://api.dev.intelligent-eu-bp.blooo.dev
COPY --from=build --chown=nonroot:nonroot /app/apps/web/dist ./dist
COPY --from=build --chown=nonroot:nonroot /app/apps/web/server-dist ./server-dist
USER nonroot
EXPOSE 8080
CMD ["server-dist/main.js"]
