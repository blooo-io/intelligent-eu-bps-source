#!/usr/bin/env node
/**
 * INT-194 — ensure Keycloak UAT IdP users exist with known passwords.
 *
 * Realm ConfigMap sync alone does not re-import users on an already-initialised
 * realm (see deploy/platform/README.md). After GitOps packs the users into
 * int-realm.json, operators (and agents blocked on auth) run this script against
 * the live admin API so passwords/roles match the fixtures.
 *
 * Usage (port-forward Keycloak HTTP first):
 *   kubectl -n keycloak port-forward svc/platform-keycloak-keycloakx-http 18082:80
 *   KEYCLOAK_URL=http://127.0.0.1:18082 \
 *   KEYCLOAK_ADMIN_PASSWORD="$(kubectl -n keycloak get secret keycloak-admin -o jsonpath='{.data.password}' | base64 -d)" \
 *   node scripts/keycloak-ensure-uat-users.mjs
 *
 * Passwords are V1 `dev`/`int` UAT placeholders (same class as client secret
 * `dev-only-replace-me`) — never for production.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REALM_PATH = path.join(
  root,
  "deploy/charts/keycloak-realms/realms/int-realm.json",
);

export const UAT_COMMUNITY_ID = "a1000000-0000-4000-8000-000000000001";

/** Fixture users mirrored from int-realm.json (INT-194). */
export const UAT_USERS = [
  {
    id: "b7bd0605-d3e5-4015-bdb7-dd1a47bbb26f",
    username: "uat-member",
    role: "member",
    email: "uat-member@example.invalid",
  },
  {
    id: "aca5adb7-0f18-4db8-aa04-6a0ff11b8ec6",
    username: "uat-manager",
    role: "manager",
    email: "uat-manager@example.invalid",
  },
  {
    id: "e4166575-164a-4c30-b801-290fadd879d1",
    username: "uat-operator",
    role: "operator",
    email: "uat-operator@example.invalid",
  },
];

export const UAT_PASSWORD = "Intelligent-UAT-2026!";

export async function loadRealmUatUsers(realmPath = REALM_PATH) {
  const realm = JSON.parse(await readFile(realmPath, "utf8"));
  const users = realm.users ?? [];
  return users.filter((u) => String(u.username ?? "").startsWith("uat-"));
}

async function adminToken(baseUrl, password) {
  const body = new URLSearchParams({
    client_id: "admin-cli",
    username: "admin",
    password,
    grant_type: "password",
  });
  const res = await fetch(
    `${baseUrl.replace(/\/$/, "")}/realms/master/protocol/openid-connect/token`,
    { method: "POST", body },
  );
  if (!res.ok) {
    throw new Error(`admin token failed: ${res.status}`);
  }
  const json = await res.json();
  return json.access_token;
}

async function ensureUser(baseUrl, token, fixture) {
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  const realmBase = `${baseUrl.replace(/\/$/, "")}/admin/realms/int`;
  const search = await fetch(
    `${realmBase}/users?username=${encodeURIComponent(fixture.username)}&exact=true`,
    { headers },
  );
  if (!search.ok) {
    throw new Error(`list user ${fixture.username}: ${search.status}`);
  }
  const found = await search.json();
  let id = found[0]?.id;
  if (!id) {
    const create = await fetch(`${realmBase}/users`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        id: fixture.id,
        username: fixture.username,
        enabled: true,
        email: fixture.email,
        emailVerified: true,
        firstName: "UAT",
        lastName: fixture.role,
        attributes: { community_id: [UAT_COMMUNITY_ID] },
      }),
    });
    if (create.status !== 201) {
      throw new Error(`create ${fixture.username}: ${create.status}`);
    }
    const loc = create.headers.get("location") ?? "";
    id = loc.split("/").pop();
    if (!id) {
      const again = await fetch(
        `${realmBase}/users?username=${encodeURIComponent(fixture.username)}&exact=true`,
        { headers },
      );
      id = (await again.json())[0]?.id;
    }
  } else {
    await fetch(`${realmBase}/users/${id}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        ...found[0],
        enabled: true,
        email: fixture.email,
        attributes: { community_id: [UAT_COMMUNITY_ID] },
      }),
    });
  }

  const pw = await fetch(`${realmBase}/users/${id}/reset-password`, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      type: "password",
      temporary: false,
      value: UAT_PASSWORD,
    }),
  });
  if (!pw.ok) {
    throw new Error(`reset-password ${fixture.username}: ${pw.status}`);
  }

  const roleRes = await fetch(`${realmBase}/roles/${fixture.role}`, { headers });
  if (!roleRes.ok) {
    throw new Error(`role ${fixture.role}: ${roleRes.status}`);
  }
  const role = await roleRes.json();
  const map = await fetch(`${realmBase}/users/${id}/role-mappings/realm`, {
    method: "POST",
    headers,
    body: JSON.stringify([role]),
  });
  // 204 created, 409 already mapped — both OK.
  if (!map.ok && map.status !== 409) {
    throw new Error(`role-map ${fixture.username}: ${map.status}`);
  }
  return { username: fixture.username, id, role: fixture.role };
}

export async function ensureUatUsers(options = {}) {
  const baseUrl = options.baseUrl ?? process.env.KEYCLOAK_URL;
  const password =
    options.adminPassword ?? process.env.KEYCLOAK_ADMIN_PASSWORD;
  if (!baseUrl || !password) {
    throw new Error("KEYCLOAK_URL and KEYCLOAK_ADMIN_PASSWORD are required");
  }
  const token = await adminToken(baseUrl, password);
  const results = [];
  for (const fixture of UAT_USERS) {
    results.push(await ensureUser(baseUrl, token, fixture));
  }
  return results;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const results = await ensureUatUsers();
  console.log(JSON.stringify({ ok: true, users: results }, null, 2));
}
