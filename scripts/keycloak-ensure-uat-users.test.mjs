/**
 * INT-194 — UAT IdP fixture users are packed in the int realm import.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  UAT_COMMUNITY_ID,
  UAT_PASSWORD,
  UAT_USERS,
  loadRealmUatUsers,
} from "./keycloak-ensure-uat-users.mjs";

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
