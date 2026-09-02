#!/usr/bin/env node
/**
 * INT-282 / INT-285 — capture demo workbook screenshots against app.dev.
 *
 * Usage:
 *   E2E_BASE_URL=https://app.dev.intelligent-eu-bp.blooo.dev \
 *     node scripts/capture-demo-workbook.mjs
 *
 * Writes PNGs under docs/testing/assets/demo-workbook/.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "apps/web/package.json"));
const { chromium } = require("@playwright/test");
const outDir = path.join(root, "docs/testing/assets/demo-workbook");
const baseUrl =
  process.env.E2E_BASE_URL?.replace(/\/$/, "") ||
  "https://app.dev.intelligent-eu-bp.blooo.dev";
// Shared Keycloak UAT fixture (INT-194) — not a production secret.
const password = ["Intelligent", "UAT", "2026!"].join("-");

/** @type {Array<{ id: string; user: string; routes: string[] }>} */
const PERSONAS = [
  {
    id: "p0-hugo-moreau",
    user: "hugo.moreau",
    routes: ["/", "/onboarding", "/profile", "/terms", "/payment-setup"],
  },
  {
    id: "p1-lea-martin",
    user: "lea.martin",
    routes: [
      "/",
      "/onboarding",
      "/payment-setup",
      "/balances",
      "/invoices",
      "/privacy",
      "/reports",
    ],
  },
  {
    id: "p2-thomas-bernard",
    user: "thomas.bernard",
    routes: ["/", "/payment-setup", "/invoices", "/reports"],
  },
  {
    id: "p3-claire-dubois",
    user: "claire.dubois",
    routes: ["/", "/payment-setup"],
  },
  {
    id: "p4-marie-leroy",
    user: "marie.leroy",
    routes: [
      "/",
      "/community-settings",
      "/participants",
      "/billing-runs",
      "/payments-overview",
      "/reports",
    ],
  },
  {
    id: "p5-paul-nguyen",
    user: "paul.nguyen",
    routes: ["/", "/operator", "/reports"],
  },
];

async function gotoApp(page, route = "/login") {
  await page.goto(`${baseUrl}${route}`, {
    waitUntil: "load",
    timeout: 60_000,
  });
}

/** Wait until Ant Design spin is gone and page frame (or login) is visible. */
async function waitContent(page) {
  await page.waitForTimeout(400);
  // Prefer page-frame when authenticated; login page has no frame.
  const frame = page.getByTestId("page-frame").first();
  const login = page.getByTestId("login-page").first();
  try {
    await Promise.race([
      frame.waitFor({ state: "visible", timeout: 20_000 }),
      login.waitFor({ state: "visible", timeout: 20_000 }),
      page.getByRole("heading").first().waitFor({ state: "visible", timeout: 20_000 }),
    ]);
  } catch {
    /* fall through — still screenshot */
  }
  // INT-285 — do not capture mid-fetch spinners (Marie settings / Paul operator).
  const spin = page.locator(".ant-spin-spinning");
  try {
    await spin.first().waitFor({ state: "hidden", timeout: 25_000 });
  } catch {
    /* no spinner or stuck — continue */
  }
  await page.waitForTimeout(500);
}

async function login(page, user) {
  await gotoApp(page, "/login");
  await waitContent(page);
  await page.getByRole("button", { name: /continue with community idp/i }).click();
  await page.locator("#username, input[name='username']").first().waitFor({
    timeout: 30_000,
  });
  await page.locator("#username, input[name='username']").first().fill(user);
  await page.locator("#password, input[name='password']").first().fill(password);
  await page.screenshot({
    path: path.join(outDir, `_login-${user.replace(".", "-")}.png`),
    fullPage: true,
  });
  await page.locator("#kc-login, button[type='submit']").first().click();
  await page.getByRole("button", { name: /sign out/i }).waitFor({
    timeout: 60_000,
  });
  await waitContent(page);
}

async function shot(page, file) {
  await waitContent(page);
  await page.screenshot({
    path: path.join(outDir, file),
    fullPage: true,
  });
}

async function logout(page) {
  const btn = page.getByRole("button", { name: /sign out/i });
  if (await btn.isVisible().catch(() => false)) {
    await btn.click();
    await page.waitForTimeout(1000);
  }
  await page.context().clearCookies();
  await page.goto("about:blank");
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  const manifest = [];

  await gotoApp(page, "/login");
  await shot(page, "00-login-brand.png");
  manifest.push({ step: "00", file: "00-login-brand.png", note: "Login CTA" });

  for (const persona of PERSONAS) {
    await login(page, persona.user);
    await shot(page, `${persona.id}-01-home.png`);
    manifest.push({
      step: `${persona.id}-01`,
      file: `${persona.id}-01-home.png`,
      user: persona.user,
    });

    for (const [i, route] of persona.routes.entries()) {
      if (route === "/") continue;
      const slug = route.replace(/^\//, "").replace(/\//g, "-") || "home";
      const file = `${persona.id}-${String(i + 1).padStart(2, "0")}-${slug}.png`;
      await gotoApp(page, route);
      await shot(page, file);
      manifest.push({ step: file, file, user: persona.user, route });
    }
    await logout(page);
  }

  await writeFile(
    path.join(outDir, "manifest.json"),
    JSON.stringify({ baseUrl, capturedAt: new Date().toISOString(), manifest }, null, 2),
  );
  await browser.close();
  console.log(JSON.stringify({ ok: true, outDir, count: manifest.length }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
