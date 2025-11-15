# INT-107 / TD-11 — AC-07 payments image.

FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/module-template/package.json packages/module-template/
COPY services/payments/package.json services/payments/
COPY config ./config
RUN pnpm install --frozen-lockfile --filter @intelligent/payments...
COPY packages/module-template packages/module-template
COPY services/payments services/payments
RUN pnpm --filter @intelligent/module-template build \
 && pnpm --filter @intelligent/payments build \
 && pnpm --filter @intelligent/payments deploy --prod /out

FROM gcr.io/distroless/nodejs22-debian13:nonroot AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
COPY --from=build --chown=nonroot:nonroot /out ./
USER nonroot
EXPOSE 8080
CMD ["dist/main.js"]
