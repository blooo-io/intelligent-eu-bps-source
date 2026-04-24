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

/** INT-218 — AC-03 Admin IdP client (must exist after realm import skipped). */
export const PARTICIPANTS_ADMIN_CLIENT = {
  clientId: "participants-admin",
  secret: "dev-participants-admin-replace-me",
  realmManagementRoles: [
    "manage-users",
    "view-users",
    "query-users",
    "view-clients",
  ],
};

export async function loadRealmUatUsers(realmPath = REALM_PATH) {
  const realm = JSON.parse(await readFile(realmPath, "utf8"));
  const users = realm.users ?? [];
  return users.filter((u) => String(u.username ?? "").startsWith("uat-"));
}

/** Forwarded proto so sslRequired=external accepts in-cluster HTTP (INT-218). */
function proxyHeaders(baseUrl) {
  if (String(baseUrl).startsWith("https://")) return {};
  return {
    "X-Forwarded-Proto": "https",
    "X-Forwarded-Port": "443",
    Forwarded: "proto=https",
  };
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
    {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        ...proxyHeaders(baseUrl),
      },
      body,
    },
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
    ...proxyHeaders(baseUrl),
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

/**
 * INT-218 — create/update participants-admin confidential client + realm-management roles.
 * Realm ConfigMap import does not re-apply clients on an already-initialised realm.
 */
export async function ensureParticipantsAdminClient(baseUrl, token) {
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    ...proxyHeaders(baseUrl),
  };
  const realmBase = `${baseUrl.replace(/\/$/, "")}/admin/realms/int`;
  const { clientId, secret, realmManagementRoles } = PARTICIPANTS_ADMIN_CLIENT;

  const search = await fetch(
    `${realmBase}/clients?clientId=${encodeURIComponent(clientId)}`,
    { headers },
  );
  if (!search.ok) {
    throw new Error(`list client ${clientId}: ${search.status}`);
  }
  const found = await search.json();
  let internalId = found[0]?.id;
  if (!internalId) {
    const create = await fetch(`${realmBase}/clients`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        clientId,
        name: "AC-03 Keycloak Admin (P-IDP)",
        enabled: true,
        publicClient: false,
        bearerOnly: false,
        standardFlowEnabled: false,
        directAccessGrantsEnabled: false,
        serviceAccountsEnabled: true,
        secret,
        protocol: "openid-connect",
      }),
    });
    if (create.status !== 201) {
      throw new Error(`create client ${clientId}: ${create.status}`);
    }
    const again = await fetch(
      `${realmBase}/clients?clientId=${encodeURIComponent(clientId)}`,
      { headers },
    );
    internalId = (await again.json())[0]?.id;
  } else {
    // Align secret + service-account flags with chart values (INT-218).
    const cur = found[0];
    const put = await fetch(`${realmBase}/clients/${internalId}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        ...cur,
        secret,
        serviceAccountsEnabled: true,
        publicClient: false,
        standardFlowEnabled: false,
        directAccessGrantsEnabled: false,
      }),
    });
    if (!put.ok) {
      throw new Error(`update client ${clientId}: ${put.status}`);
    }
  }
  if (!internalId) {
    throw new Error(`client ${clientId} missing after create`);
  }

  const saRes = await fetch(
    `${realmBase}/clients/${internalId}/service-account-user`,
    { headers },
  );
  if (!saRes.ok) {
    throw new Error(`service-account-user: ${saRes.status}`);
  }
  const saUser = await saRes.json();

  const rmClientSearch = await fetch(
    `${realmBase}/clients?clientId=realm-management`,
    { headers },
  );
  const rmClient = (await rmClientSearch.json())[0];
  if (!rmClient?.id) {
    throw new Error("realm-management client missing");
  }
  const available = await fetch(
    `${realmBase}/users/${saUser.id}/role-mappings/clients/${rmClient.id}/available`,
    { headers },
  );
  const availableRoles = available.ok ? await available.json() : [];
  const wanted = availableRoles.filter((r) =>
    realmManagementRoles.includes(r.name),
  );
  if (wanted.length > 0) {
    const map = await fetch(
      `${realmBase}/users/${saUser.id}/role-mappings/clients/${rmClient.id}`,
      {
        method: "POST",
        headers,
        body: JSON.stringify(wanted),
      },
    );
    if (!map.ok && map.status !== 409) {
      throw new Error(`map realm-management roles: ${map.status}`);
    }
  }
  return { clientId, internalId, serviceAccountUserId: saUser.id };
}

/**
 * INT-224 — realm ConfigMap import does not re-apply smtpServer on an
 * already-initialised realm. PUT smtp via Admin API so invitations reach Mailpit.
 */
export const DEV_MAILPIT_SMTP = {
  host: "mailpit.int-apps.svc.cluster.local",
  port: "1025",
  from: "noreply@dev.intelligent-eu-bp.blooo.dev",
  fromDisplayName: "INTELLIGENT billing (dev)",
  replyTo: "noreply@dev.intelligent-eu-bp.blooo.dev",
  replyToDisplayName: "INTELLIGENT billing (dev)",
  envelopeFrom: "",
  ssl: "false",
  starttls: "false",
  auth: "false",
  user: "",
  password: "",
};

export async function ensureRealmSmtp(baseUrl, token, smtp = DEV_MAILPIT_SMTP) {
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    ...proxyHeaders(baseUrl),
  };
  const realmUrl = `${baseUrl.replace(/\/$/, "")}/admin/realms/int`;
  const get = await fetch(realmUrl, { headers });
  if (!get.ok) {
    throw new Error(`get realm int: ${get.status}`);
  }
  const realm = await get.json();
  const put = await fetch(realmUrl, {
    method: "PUT",
    headers,
    body: JSON.stringify({ ...realm, smtpServer: smtp }),
  });
  if (!put.ok) {
    throw new Error(`put realm smtp: ${put.status}`);
  }
  return { host: smtp.host, port: smtp.port, from: smtp.from };
}

export async function ensureUatUsers(options = {}) {
  const baseUrl = options.baseUrl ?? process.env.KEYCLOAK_URL;
  const password =
    options.adminPassword ?? process.env.KEYCLOAK_ADMIN_PASSWORD;
  if (!baseUrl || !password) {
    throw new Error("KEYCLOAK_URL and KEYCLOAK_ADMIN_PASSWORD are required");
  }
  const token = await adminToken(baseUrl, password);
  const smtp = await ensureRealmSmtp(baseUrl, token);
  const adminClient = await ensureParticipantsAdminClient(baseUrl, token);
  const results = [];
  for (const fixture of UAT_USERS) {
    results.push(await ensureUser(baseUrl, token, fixture));
  }
  return { users: results, adminClient, smtp };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const results = await ensureUatUsers();
  console.log(JSON.stringify({ ok: true, ...results }, null, 2));
}
