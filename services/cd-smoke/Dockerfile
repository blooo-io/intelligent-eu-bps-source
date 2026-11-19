# INT-156 / TD-11 — CD smoke image and NestJS module Dockerfile pattern.
# Build context: repository root (`docker build -f services/cd-smoke/Dockerfile .`).
# Product modules copy this layout: multi-stage build, non-root USER, /health on 8080.
# Runtime is distroless so the image does not ship a Debian userland (Trivy OS noise).
# See deploy/docker/README.md.
# INT-319 — bump to prove GHCR push of services-cd-smoke on develop after rename.
# INT-420 — strip vitest before `npm install` (vitest 4 + npm arborist → edgesOut crash).

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY services/cd-smoke/package.json services/cd-smoke/tsconfig.json services/cd-smoke/tsconfig.build.json ./
COPY services/cd-smoke/src ./src
# Image build only needs tsc. Vitest stays a workspace/dev dependency; installing it
# here with npm 10 fails: "Cannot read properties of null (reading 'edgesOut')".
RUN node --input-type=module -e "\
import { readFileSync, writeFileSync } from 'node:fs';\
const p = JSON.parse(readFileSync('package.json', 'utf8'));\
delete p.devDependencies?.vitest;\
delete p.devDependencies?.['@vitest/coverage-v8'];\
writeFileSync('package.json', JSON.stringify(p, null, 2));\
" \
  && npm install \
  && npm run build

# Distroless Node 22 on Debian 13 (debian12 node images are no longer rebuilt;
# they ship an openssl that fails Trivy HIGH/CRITICAL). Non-root uid 65532.
FROM gcr.io/distroless/nodejs22-debian13:nonroot AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
COPY --from=build --chown=nonroot:nonroot /app/dist ./dist
# Non-root is mandatory for scripts/module-images.mjs (and chart securityContext).
USER nonroot
EXPOSE 8080
# Distroless entrypoint is already `node`.
CMD ["dist/main.js"]
