# INT-454 — Mock CGW cluster image (DDHub CGW REST subset + /test/v1/inject).
# Build context: repository root.

FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/ewds-client/package.json packages/ewds-client/
COPY services/mock-cgw/package.json services/mock-cgw/
COPY config ./config
RUN pnpm install --frozen-lockfile --filter @intelligent/mock-cgw...
COPY packages/ewds-client packages/ewds-client
COPY services/mock-cgw services/mock-cgw
RUN pnpm --filter @intelligent/ewds-client build \
 && pnpm --filter @intelligent/mock-cgw build \
 && pnpm --filter @intelligent/mock-cgw deploy --prod /out

FROM gcr.io/distroless/nodejs22-debian13:nonroot AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
COPY --from=build --chown=nonroot:nonroot /out ./
USER nonroot
EXPOSE 8080
CMD ["dist/main.js"]
