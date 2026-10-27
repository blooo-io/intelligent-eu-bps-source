/**
 * INT-194 — UAT IdP fixture users are packed in the int realm import.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  DEV_MAILPIT_SMTP,
  PARTICIPANTS_ADMIN_CLIENT,
  S1_COMMUNITY_ID,
  S1_USERS,
  UAT_COMMUNITY_ID,
  UAT_PASSWORD,
  UAT_USERS,
  loadRealmS1Users,
  loadRealmUatUsers,
} from "./keycloak-ensure-uat-users.mjs";
import { readFile } from "node:fs/promises";

test("int-realm.json packs UAT IdP users hugo/sofia/paul (INT-194 / INT-282)", async () => {
  const users = await loadRealmUatUsers();
  const byName = Object.fromEntries(users.map((u) => [u.username, u]));
  assert.equal(UAT_USERS.length, 3);
  for (const fixture of UAT_USERS) {
    const row = byName[fixture.username];
    assert.ok(row, `missing ${fixture.username}`);
    assert.equal(row.id, fixture.id);
    assert.equal(row.enabled, true);
    assert.equal(row.firstName, fixture.firstName);
    assert.equal(row.lastName, fixture.lastName);
    assert.deepEqual(row.realmRoles, [fixture.role]);
    assert.deepEqual(row.attributes?.community_id, [UAT_COMMUNITY_ID]);
    // INT-325 — passwords applied by ensure script, not realm JSON.
    assert.equal(row.credentials, undefined);
  }
  assert.equal(typeof UAT_PASSWORD, "string");
  assert.ok(UAT_PASSWORD.length >= 8);
});

test("int-realm.json packs S1 IdP users lea/thomas/claire/marie/hugo (INT-236 / INT-285)", async () => {
  const users = await loadRealmS1Users();
  const byName = Object.fromEntries(users.map((u) => [u.username, u]));
  assert.ok(byName["marie.leroy"], "missing marie.leroy");
  assert.ok(byName["hugo.moreau"], "missing hugo.moreau");
  assert.equal(S1_USERS.length, 5);
  for (const fixture of S1_USERS) {
    const row = byName[fixture.username];
    assert.ok(row, `missing ${fixture.username}`);
    assert.equal(row.id, fixture.id);
    assert.equal(row.enabled, true);
    assert.equal(row.firstName, fixture.firstName);
    assert.equal(row.lastName, fixture.lastName);
    assert.deepEqual(row.realmRoles, [fixture.role]);
    assert.deepEqual(row.attributes?.community_id, [S1_COMMUNITY_ID]);
    assert.equal(row.credentials, undefined);
  }
});

test("ensure script uses partialImport for fixed Keycloak user ids (INT-239)", async () => {
  const src = await readFile(
    new URL("./keycloak-ensure-uat-users.mjs", import.meta.url),
    "utf8",
  );
  assert.match(src, /partialImport/);
  assert.match(src, /ifResourceExists:\s*"OVERWRITE"/);
  assert.match(src, /id !== fixture\.id/);
});

test("ensure script packs module-service client + sslRequired none (INT-314)", async () => {
  const source = await readFile(
    new URL("./keycloak-ensure-uat-users.mjs", import.meta.url),
    "utf8",
  );
  assert.match(source, /MODULE_SERVICE_CLIENT/);
  assert.match(source, /ensureModuleServiceClient/);
  assert.match(source, /ensureApisixGatewayClient/);
  assert.match(source, /ensureRealmSslRequired/);
  assert.match(source, /dev-module-service-replace-me/);
  assert.match(source, /sslRequired/);
  assert.match(source, /KEYCLOAK_MODULE_SERVICE_CLIENT_SECRET/);
});

test("ensure script sets Volt loginTheme on int/demo (INT-332)", async () => {
  const source = await readFile(
    new URL("./keycloak-ensure-uat-users.mjs", import.meta.url),
    "utf8",
  );
  assert.match(source, /ensureRealmLoginTheme/);
  assert.match(source, /LOGIN_THEME/);
  assert.match(source, /LOGIN_DISPLAY_NAME/);
  assert.match(source, /loginTheme/);
  assert.match(source, /intelligent/);
  assert.match(source, /INTELLIGENT Billing & Payment Login/);
});

test("ensure script packs participants-admin client secret (INT-218 / INT-325)", async () => {
  const realm = JSON.parse(
    await readFile("deploy/charts/keycloak-realms/realms/int-realm.json", "utf8"),
  );
  const client = (realm.clients ?? []).find(
    (c) => c.clientId === PARTICIPANTS_ADMIN_CLIENT.clientId,
  );
  assert.ok(client);
  // INT-325 — secret lives in ensure script / OpenBao, not realm JSON.
  assert.equal(client.secret, undefined);
  assert.equal(client.serviceAccountsEnabled, true);
  assert.ok(PARTICIPANTS_ADMIN_CLIENT.secret);
  assert.equal(PARTICIPANTS_ADMIN_CLIENT.realmManagementRoles.includes("manage-users"), true);
  assert.equal(
    PARTICIPANTS_ADMIN_CLIENT.realmManagementRoles.includes("view-realm"),
    true,
    "INT-285 CSV invite needs GET /roles/{name} via view-realm",
  );
});

test("int-realm.json packs Mailpit SMTP (INT-224)", async () => {
  const realm = JSON.parse(
    await readFile("deploy/charts/keycloak-realms/realms/int-realm.json", "utf8"),
  );
  assert.equal(realm.smtpServer?.host, DEV_MAILPIT_SMTP.host);
  assert.equal(realm.smtpServer?.port, DEV_MAILPIT_SMTP.port);
  assert.equal(realm.smtpServer?.auth, "false");
});
