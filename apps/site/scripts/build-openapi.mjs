#!/usr/bin/env node
/**
 * INT-455 — public OpenAPI browser withdrawn. No-op kept so existing
 * package scripts (docs:prepare, test) do not need renames.
 */
console.log(
  JSON.stringify({
    msg: "public OpenAPI withdrawn (INT-455); skipping vitepress-openapi prepare",
  }),
);