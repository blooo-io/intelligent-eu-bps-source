/**
 * INT-194 — UAT IdP fixture users are packed in the int realm import.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  DEV_MAILPIT_SMTP,
  PARTICIPANTS_ADMIN_CLIENT,
  UAT_COMMUNITY_ID,
  UAT_PASSWORD,
  UAT_USERS,
  loadRealmUatUsers,
} from "./keycloak-ensure-uat-users.mjs";
import { readFile } from "node:fs/promises";

test("int-realm.json packs uat-member/manager/operator (INT-194)", async () => {
  const users = await loadRealmUatUsers();
  const byName = Object.fromEntries(users.map((u) => [u.username, u]));
  for (const fixture of UAT_USERS) {
    const row = byName[fixture.username];
    assert.ok(row, `missing ${fixture.username}`);
    assert.equal(row.id, fixture.id);
    assert.equal(row.enabled, true);
    assert.deepEqual(row.realmRoles, [fixture.role]);
    assert.deepEqual(row.attributes?.community_id, [UAT_COMMUNITY_ID]);
    assert.equal(row.credentials?.[0]?.type, "password");
    assert.equal(row.credentials?.[0]?.temporary, false);
    assert.equal(row.credentials?.[0]?.value, UAT_PASSWORD);
  }
});

test("ensure script packs participants-admin client secret (INT-218)", async () => {
  const realm = JSON.parse(
    await readFile("deploy/charts/keycloak-realms/realms/int-realm.json", "utf8"),
  );
  const client = (realm.clients ?? []).find(
    (c) => c.clientId === PARTICIPANTS_ADMIN_CLIENT.clientId,
  );
  assert.ok(client);
  assert.equal(client.secret, PARTICIPANTS_ADMIN_CLIENT.secret);
  assert.equal(client.serviceAccountsEnabled, true);
  assert.equal(PARTICIPANTS_ADMIN_CLIENT.realmManagementRoles.includes("manage-users"), true);
});

test("int-realm.json packs Mailpit SMTP (INT-224)", async () => {
  const realm = JSON.parse(
    await readFile("deploy/charts/keycloak-realms/realms/int-realm.json", "utf8"),
  );
  assert.equal(realm.smtpServer?.host, DEV_MAILPIT_SMTP.host);
  assert.equal(realm.smtpServer?.port, DEV_MAILPIT_SMTP.port);
  assert.equal(realm.smtpServer?.auth, "false");
});
