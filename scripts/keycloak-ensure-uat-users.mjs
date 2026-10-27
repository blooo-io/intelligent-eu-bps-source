#!/usr/bin/env node
/**
 * INT-194 / INT-236 / INT-325 — ensure Keycloak UAT + S1 IdP users and client
 * secrets exist (bootstrap path; secrets never committed in realm JSON).
 *
 * Realm ConfigMap sync alone does not re-import users/secrets on an
 * already-initialised realm (see deploy/platform/README.md). After GitOps packs
 * user shells into int-realm.json, operators run this script against the live
 * admin API so passwords/roles/client secrets match OpenBao.
 *
 * Usage (port-forward Keycloak HTTP first):
 *   kubectl -n keycloak port-forward svc/platform-keycloak-keycloakx-http 18082:80
 *   KEYCLOAK_URL=http://127.0.0.1:18082 \
 *   KEYCLOAK_ADMIN_PASSWORD="$(kubectl -n keycloak get secret keycloak-admin -o jsonpath='{.data.password}' | base64 -d)" \
 *   node scripts/keycloak-ensure-uat-users.mjs
 *
 * Optional overrides (default to V1 OpenBao placeholders):
 *   KEYCLOAK_MODULE_SERVICE_CLIENT_SECRET
 *   KEYCLOAK_PARTICIPANTS_ADMIN_CLIENT_SECRET
 *   KEYCLOAK_APISIX_GATEWAY_CLIENT_SECRET
 *   KEYCLOAK_UAT_PASSWORD
 *
 * Rotation (INT-325): write new values to OpenBao (platform/apisix
 * oidc_client_secret, each module KEYCLOAK_SERVICE_CLIENT_SECRET,
 * and participants KEYCLOAK_ADMIN_CLIENT_SECRET), re-run this script with the
 * same values exported, then bounce modules / APISIX so ExternalSecrets refresh.
 * Never for production IdP passwords.
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
/** INT-236 — AC-15 S1 community (market / Stripe billing fixture). */
export const S1_COMMUNITY_ID = "c0ffee00-1234-4abc-8def-0123456789ab";

/**
 * Fixture users mirrored from int-realm.json (INT-194 / INT-282).
 * Human-readable logins for demo / tester workbooks; Keycloak ids stay fixed
 * so AC-03 seed idpUserId bindings remain one chain.
 */
export const UAT_USERS = [
  {
    id: "b7bd0605-d3e5-4015-bdb7-dd1a47bbb26f",
    username: "hugo.petit",
    role: "member",
    email: "hugo.petit@example.invalid",
    communityId: UAT_COMMUNITY_ID,
    firstName: "Hugo",
    lastName: "Petit",
  },
  {
    id: "aca5adb7-0f18-4db8-aa04-6a0ff11b8ec6",
    username: "sofia.garcia",
    role: "manager",
    email: "sofia.garcia@example.invalid",
    communityId: UAT_COMMUNITY_ID,
    firstName: "Sofia",
    lastName: "Garcia",
  },
  {
    id: "e4166575-164a-4c30-b801-290fadd879d1",
    username: "paul.nguyen",
    role: "operator",
    email: "paul.nguyen@example.invalid",
    communityId: UAT_COMMUNITY_ID,
    firstName: "Paul",
    lastName: "Nguyen",
  },
];

/**
 * INT-236 / INT-282 — S1 IdP users bound to AC-03 seed idpUserId (one identity
 * chain with market trades / Connect / invoices).
 */
export const S1_USERS = [
  {
    id: "c1a55e01-0001-4000-8000-000000000001",
    username: "lea.martin",
    role: "member",
    email: "lea.martin@example.invalid",
    communityId: S1_COMMUNITY_ID,
    firstName: "Léa",
    lastName: "Martin",
  },
  {
    id: "c1a55e01-0002-4000-8000-000000000002",
    username: "thomas.bernard",
    role: "member",
    email: "thomas.bernard@example.invalid",
    communityId: S1_COMMUNITY_ID,
    firstName: "Thomas",
    lastName: "Bernard",
  },
  {
    id: "c1a55e01-0003-4000-8000-000000000003",
    username: "claire.dubois",
    role: "member",
    email: "claire.dubois@example.invalid",
    communityId: S1_COMMUNITY_ID,
    firstName: "Claire",
    lastName: "Dubois",
  },
  {
    // INT-241 — Start billing run from the portal for community c0ffee00…
    id: "c1a55e01-0004-4000-8000-000000000004",
    username: "marie.leroy",
    role: "manager",
    email: "marie.leroy@example.invalid",
    communityId: S1_COMMUNITY_ID,
    firstName: "Marie",
    lastName: "Leroy",
  },
  {
    // INT-285 — Invited consumer on Horizon Energy (full onboarding demo).
    id: "c1a55e01-0005-4000-8000-000000000005",
    username: "hugo.moreau",
    role: "member",
    email: "hugo.moreau@example.invalid",
    communityId: S1_COMMUNITY_ID,
    firstName: "Hugo",
    lastName: "Moreau",
  },
];

// Shared Keycloak UAT fixture (INT-194) — V1 placeholder only; never in realm JSON.
export const UAT_PASSWORD_DEFAULT = ["Intelligent", "UAT", "2026!"].join("-");
export const UAT_PASSWORD =
  process.env.KEYCLOAK_UAT_PASSWORD || UAT_PASSWORD_DEFAULT;

/** INT-218 — AC-03 Admin IdP client (secret from OpenBao / env, not realm JSON). */
export const PARTICIPANTS_ADMIN_CLIENT = {
  clientId: "participants-admin",
  secret:
    process.env.KEYCLOAK_PARTICIPANTS_ADMIN_CLIENT_SECRET ||
    "dev-participants-admin-replace-me",
  realmManagementRoles: [
    "manage-users",
    "view-users",
    "query-users",
    "view-clients",
    // INT-285 — GET /roles/{name} for CSV invite createUser (Keycloakx has
    // view-realm; query-roles is not present on this realm-management client).
    "view-realm",
  ],
};

/** INT-169 / INT-325 — APISIX gateway confidential client (matches OpenBao oidc_client_secret). */
export const APISIX_GATEWAY_CLIENT = {
  clientId: "apisix-gateway",
  secret:
    process.env.KEYCLOAK_APISIX_GATEWAY_CLIENT_SECRET || "dev-only-replace-me",
};

export async function loadRealmUatUsers(realmPath = REALM_PATH) {
  const realm = JSON.parse(await readFile(realmPath, "utf8"));
  const users = realm.users ?? [];
  // INT-282 — match by fixed id (usernames are human-readable, not uat-* prefix).
  const ids = new Set(UAT_USERS.map((u) => u.id));
  return users.filter((u) => ids.has(u.id));
}

/** INT-236 / INT-282 — S1 Keycloak fixtures from int-realm.json. */
export async function loadRealmS1Users(realmPath = REALM_PATH) {
  const realm = JSON.parse(await readFile(realmPath, "utf8"));
  const users = realm.users ?? [];
  const ids = new Set(S1_USERS.map((u) => u.id));
  return users.filter((u) => ids.has(u.id));
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

/**
 * INT-239 — Admin POST /users ignores `id` and assigns a random UUID.
 * Realm partialImport honours fixture ids so AC-03 seed idpUserId matches.
 */
async function importUserWithFixedId(baseUrl, token, fixture) {
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    ...proxyHeaders(baseUrl),
  };
  const realmBase = `${baseUrl.replace(/\/$/, "")}/admin/realms/int`;
  const communityId = fixture.communityId ?? UAT_COMMUNITY_ID;
  const firstName = fixture.firstName ?? "UAT";
  const lastName = fixture.lastName ?? fixture.role;
  const res = await fetch(`${realmBase}/partialImport`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      ifResourceExists: "OVERWRITE",
      users: [
        {
          id: fixture.id,
          username: fixture.username,
          enabled: true,
          email: fixture.email,
          emailVerified: true,
          firstName,
          lastName,
          attributes: { community_id: [communityId] },
          realmRoles: [fixture.role],
          credentials: [
            {
              type: "password",
              temporary: false,
              value: UAT_PASSWORD,
            },
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `partialImport ${fixture.username}: ${res.status} ${body}`,
    );
  }
  return fixture.id;
}

async function deleteUserIfPresent(realmBase, headers, id, context) {
  const del = await fetch(`${realmBase}/users/${id}`, {
    method: "DELETE",
    headers,
  });
  if (!del.ok && del.status !== 404) {
    throw new Error(`${context}: ${del.status}`);
  }
}

async function lookupFixtureUser(realmBase, headers, fixture) {
  const search = await fetch(
    `${realmBase}/users?username=${encodeURIComponent(fixture.username)}&exact=true`,
    { headers },
  );
  if (!search.ok) {
    throw new Error(`list user ${fixture.username}: ${search.status}`);
  }
  const found = await search.json();
  let id = found[0]?.id;
  let existing = found[0];
  if (!id) {
    const byId = await fetch(`${realmBase}/users/${fixture.id}`, { headers });
    if (byId.ok) {
      existing = await byId.json();
      id = existing?.id;
    }
  }
  return { id, existing };
}

async function syncFixtureUserRecord(
  baseUrl,
  token,
  realmBase,
  headers,
  fixture,
  id,
  existing,
) {
  const communityId = fixture.communityId ?? UAT_COMMUNITY_ID;
  const firstName = fixture.firstName ?? "UAT";
  const lastName = fixture.lastName ?? fixture.role;

  if (!id || id !== fixture.id) {
    if (id && id !== fixture.id) {
      await deleteUserIfPresent(
        realmBase,
        headers,
        id,
        `delete mismatched ${fixture.username}`,
      );
    }
    return importUserWithFixedId(baseUrl, token, fixture);
  }
  if (existing?.username !== fixture.username) {
    await deleteUserIfPresent(
      realmBase,
      headers,
      id,
      `delete for rename ${existing.username}`,
    );
    return importUserWithFixedId(baseUrl, token, fixture);
  }
  await fetch(`${realmBase}/users/${id}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      ...existing,
      enabled: true,
      email: fixture.email,
      firstName,
      lastName,
      attributes: { community_id: [communityId] },
    }),
  });
  return id;
}

async function ensureUser(baseUrl, token, fixture) {
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    ...proxyHeaders(baseUrl),
  };
  const realmBase = `${baseUrl.replace(/\/$/, "")}/admin/realms/int`;
  const { id: foundId, existing } = await lookupFixtureUser(
    realmBase,
    headers,
    fixture,
  );
  const id = await syncFixtureUserRecord(
    baseUrl,
    token,
    realmBase,
    headers,
    fixture,
    foundId,
    existing,
  );

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
async function resolveParticipantsAdminClientId(realmBase, headers, clientId, secret) {
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
    return internalId;
  }
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
  return internalId;
}

export async function ensureParticipantsAdminClient(baseUrl, token) {
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    ...proxyHeaders(baseUrl),
  };
  const realmBase = `${baseUrl.replace(/\/$/, "")}/admin/realms/int`;
  const { clientId, secret, realmManagementRoles } = PARTICIPANTS_ADMIN_CLIENT;

  const internalId = await resolveParticipantsAdminClientId(
    realmBase,
    headers,
    clientId,
    secret,
  );
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
  fromDisplayName: "Intelligent Billing & Payment (dev)",
  replyTo: "noreply@dev.intelligent-eu-bp.blooo.dev",
  replyToDisplayName: "Intelligent Billing & Payment (dev)",
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

/**
 * INT-314 — Cilium pod CIDR 100.64.0.0/10 is not "private" for Keycloak
 * sslRequired=external, so in-cluster HTTP client-credentials get HTTPS required.
 * V1 / virtual dev uses sslRequired=none (matches realm JSON import).
 */
export async function ensureRealmSslRequired(
  baseUrl,
  token,
  realmName,
  sslRequired = "none",
) {
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    ...proxyHeaders(baseUrl),
  };
  const realmUrl = `${baseUrl.replace(/\/$/, "")}/admin/realms/${realmName}`;
  const get = await fetch(realmUrl, { headers });
  if (!get.ok) {
    throw new Error(`get realm ${realmName}: ${get.status}`);
  }
  const realm = await get.json();
  if (realm.sslRequired === sslRequired) {
    return { realm: realmName, sslRequired, updated: false };
  }
  const put = await fetch(realmUrl, {
    method: "PUT",
    headers,
    body: JSON.stringify({ ...realm, sslRequired }),
  });
  if (!put.ok) {
    throw new Error(`put realm ${realmName} sslRequired: ${put.status}`);
  }
  return { realm: realmName, sslRequired, updated: true };
}

/**
 * INT-332 — Volt login theme + brand title on existing realms (ConfigMap
 * import does not re-apply after first boot; see deploy/platform/README.md).
 */
export const LOGIN_THEME = "intelligent";
export const LOGIN_DISPLAY_NAME = "INTELLIGENT Billing & Payment Login";

export async function ensureRealmLoginTheme(
  baseUrl,
  token,
  realmName,
  loginTheme = LOGIN_THEME,
  displayName = LOGIN_DISPLAY_NAME,
) {
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    ...proxyHeaders(baseUrl),
  };
  const realmUrl = `${baseUrl.replace(/\/$/, "")}/admin/realms/${realmName}`;
  const get = await fetch(realmUrl, { headers });
  if (!get.ok) {
    throw new Error(`get realm ${realmName}: ${get.status}`);
  }
  const realm = await get.json();
  if (realm.loginTheme === loginTheme && realm.displayName === displayName) {
    return { realm: realmName, loginTheme, displayName, updated: false };
  }
  const put = await fetch(realmUrl, {
    method: "PUT",
    headers,
    body: JSON.stringify({ ...realm, loginTheme, displayName }),
  });
  if (!put.ok) {
    throw new Error(`put realm ${realmName} loginTheme/displayName: ${put.status}`);
  }
  return { realm: realmName, loginTheme, displayName, updated: true };
}

/** INT-287 / INT-314 / INT-325 — inter-module service JWT client (OpenBao → modules). */
export const MODULE_SERVICE_CLIENT = {
  clientId: "module-service",
  secret:
    process.env.KEYCLOAK_MODULE_SERVICE_CLIENT_SECRET ||
    "dev-module-service-replace-me",
};

async function resolveModuleServiceClientId(realmBase, headers, clientId, secret) {
  const search = await fetch(
    `${realmBase}/clients?clientId=${encodeURIComponent(clientId)}`,
    { headers },
  );
  if (!search.ok) {
    throw new Error(`list client ${clientId}: ${search.status}`);
  }
  const found = await search.json();
  if (found[0]?.id) {
    const put = await fetch(`${realmBase}/clients/${found[0].id}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        ...found[0],
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
    return found[0].id;
  }
  const create = await fetch(`${realmBase}/clients`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      clientId,
      name: "Inter-module service JWT (INT-287)",
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
  return (await again.json())[0]?.id;
}

async function ensureServiceRealmRole(realmBase, headers) {
  const rolesRes = await fetch(`${realmBase}/roles`, { headers });
  if (!rolesRes.ok) {
    throw new Error(`list realm roles: ${rolesRes.status}`);
  }
  const existing = (await rolesRes.json()).find((r) => r.name === "service");
  if (existing) {
    return existing;
  }
  const createRole = await fetch(`${realmBase}/roles`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: "service",
      description: "Internal service principal",
    }),
  });
  if (createRole.status !== 201) {
    throw new Error(`create role service: ${createRole.status}`);
  }
  const again = await fetch(`${realmBase}/roles/service`, { headers });
  return again.json();
}

async function ensureServiceRoleMapped(realmBase, headers, userId, serviceRole) {
  const mapped = await fetch(
    `${realmBase}/users/${userId}/role-mappings/realm`,
    { headers },
  );
  const current = mapped.ok ? await mapped.json() : [];
  if (current.some((r) => r.name === "service")) {
    return;
  }
  const map = await fetch(`${realmBase}/users/${userId}/role-mappings/realm`, {
    method: "POST",
    headers,
    body: JSON.stringify([serviceRole]),
  });
  if (!map.ok && map.status !== 409) {
    throw new Error(`map service role: ${map.status}`);
  }
}

export async function ensureModuleServiceClient(
  baseUrl,
  token,
  realmName = "int",
) {
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    ...proxyHeaders(baseUrl),
  };
  const realmBase = `${baseUrl.replace(/\/$/, "")}/admin/realms/${realmName}`;
  const { clientId, secret } = MODULE_SERVICE_CLIENT;
  const internalId = await resolveModuleServiceClientId(
    realmBase,
    headers,
    clientId,
    secret,
  );
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
  const serviceRole = await ensureServiceRealmRole(realmBase, headers);
  await ensureServiceRoleMapped(realmBase, headers, saUser.id, serviceRole);

  return {
    realm: realmName,
    clientId,
    internalId,
    serviceAccountUserId: saUser.id,
  };
}

async function resolveApisixGatewayClientId(realmBase, headers, clientId, secret) {
  const search = await fetch(
    `${realmBase}/clients?clientId=${encodeURIComponent(clientId)}`,
    { headers },
  );
  if (!search.ok) {
    throw new Error(`list client ${clientId}: ${search.status}`);
  }
  const found = await search.json();
  if (found[0]?.id) {
    const put = await fetch(`${realmBase}/clients/${found[0].id}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        ...found[0],
        secret,
        publicClient: false,
        serviceAccountsEnabled: false,
        standardFlowEnabled: false,
        directAccessGrantsEnabled: false,
      }),
    });
    if (!put.ok) {
      throw new Error(`update client ${clientId}: ${put.status}`);
    }
    return found[0].id;
  }
  const create = await fetch(`${realmBase}/clients`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      clientId,
      name: "APISIX gateway (bearer JWT validation)",
      enabled: true,
      publicClient: false,
      bearerOnly: false,
      standardFlowEnabled: false,
      directAccessGrantsEnabled: false,
      serviceAccountsEnabled: false,
      secret,
      protocol: "openid-connect",
      attributes: {
        "access.token.lifespan": "300",
      },
    }),
  });
  if (create.status !== 201) {
    throw new Error(`create client ${clientId}: ${create.status}`);
  }
  const again = await fetch(
    `${realmBase}/clients?clientId=${encodeURIComponent(clientId)}`,
    { headers },
  );
  return (await again.json())[0]?.id;
}

/** INT-325 — sync apisix-gateway client secret to OpenBao oidc_client_secret. */
export async function ensureApisixGatewayClient(
  baseUrl,
  token,
  realmName = "int",
) {
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    ...proxyHeaders(baseUrl),
  };
  const realmBase = `${baseUrl.replace(/\/$/, "")}/admin/realms/${realmName}`;
  const { clientId, secret } = APISIX_GATEWAY_CLIENT;
  const internalId = await resolveApisixGatewayClientId(
    realmBase,
    headers,
    clientId,
    secret,
  );
  if (!internalId) {
    throw new Error(`client ${clientId} missing after create`);
  }
  return { realm: realmName, clientId, internalId };
}

export async function ensureUatUsers(options = {}) {
  const baseUrl = options.baseUrl ?? process.env.KEYCLOAK_URL;
  const password =
    options.adminPassword ?? process.env.KEYCLOAK_ADMIN_PASSWORD;
  if (!baseUrl || !password) {
    throw new Error("KEYCLOAK_URL and KEYCLOAK_ADMIN_PASSWORD are required");
  }
  const token = await adminToken(baseUrl, password);
  const sslInt = await ensureRealmSslRequired(baseUrl, token, "int", "none");
  let sslDemo = null;
  try {
    sslDemo = await ensureRealmSslRequired(baseUrl, token, "demo", "none");
  } catch {
    // demo realm may be absent on some environments
  }
  const themeInt = await ensureRealmLoginTheme(baseUrl, token, "int");
  let themeDemo = null;
  try {
    themeDemo = await ensureRealmLoginTheme(baseUrl, token, "demo");
  } catch {
    // demo realm may be absent on some environments
  }
  const smtp = await ensureRealmSmtp(baseUrl, token);
  const adminClient = await ensureParticipantsAdminClient(baseUrl, token);
  const moduleService = await ensureModuleServiceClient(baseUrl, token, "int");
  const apisixGateway = await ensureApisixGatewayClient(baseUrl, token, "int");
  let moduleServiceDemo = null;
  let apisixGatewayDemo = null;
  try {
    moduleServiceDemo = await ensureModuleServiceClient(baseUrl, token, "demo");
  } catch {
    // optional
  }
  try {
    apisixGatewayDemo = await ensureApisixGatewayClient(baseUrl, token, "demo");
  } catch {
    // optional
  }
  const results = [];
  for (const fixture of [...UAT_USERS, ...S1_USERS]) {
    results.push(await ensureUser(baseUrl, token, fixture));
  }
  return {
    users: results,
    adminClient,
    smtp,
    sslInt,
    sslDemo,
    themeInt,
    themeDemo,
    moduleService,
    moduleServiceDemo,
    apisixGateway,
    apisixGatewayDemo,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const results = await ensureUatUsers();
  console.log(JSON.stringify({ ok: true, ...results }, null, 2));
}
