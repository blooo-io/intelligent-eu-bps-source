<script setup lang="ts">
/**
 * INT-403 — username/password → Keycloak access_token for the OpenAPI playground.
 * Calls the Resource Owner Password Credentials grant on the public `docs` client.
 */
import { ref } from "vue";

const props = withDefaults(
  defineProps<{
    tokenUrl?: string;
    clientId?: string;
  }>(),
  {
    tokenUrl:
      "https://auth.intelligent-eu-bp.blooo.dev/realms/int/protocol/openid-connect/token",
    clientId: "docs",
  },
);

const username = ref("hugo.petit");
const password = ref("Intelligent-UAT-2026!");
const busy = ref(false);
const error = ref("");
const accessToken = ref("");
const copied = ref(false);

async function fetchToken() {
  busy.value = true;
  error.value = "";
  accessToken.value = "";
  copied.value = false;
  try {
    const body = new URLSearchParams({
      grant_type: "password",
      client_id: props.clientId,
      username: username.value.trim(),
      password: password.value,
      scope: "openid",
    });
    const res = await fetch(props.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const json = (await res.json()) as {
      access_token?: string;
      error_description?: string;
      error?: string;
    };
    if (!res.ok || !json.access_token) {
      error.value =
        json.error_description ||
        json.error ||
        `Token request failed (${res.status})`;
      return;
    }
    accessToken.value = json.access_token;
  } catch (err) {
    error.value =
      err instanceof Error
        ? err.message
        : "Token request failed (network / CORS)";
  } finally {
    busy.value = false;
  }
}

async function copyToken() {
  if (!accessToken.value) return;
  await navigator.clipboard.writeText(accessToken.value);
  copied.value = true;
}
</script>

<template>
  <div class="api-token-helper" data-testid="api-token-helper">
    <p class="hint">
      Sample IdP only (V1 / UAT). Paste the token into <strong>Try it out →
      Authorization</strong> as <code>Bearer &lt;token&gt;</code>.
    </p>
    <div class="row">
      <label>
        Username
        <input v-model="username" autocomplete="username" data-testid="api-token-username" />
      </label>
      <label>
        Password
        <input
          v-model="password"
          type="password"
          autocomplete="current-password"
          data-testid="api-token-password"
        />
      </label>
      <button type="button" :disabled="busy" data-testid="api-token-submit" @click="fetchToken">
        {{ busy ? "Requesting…" : "Get access token" }}
      </button>
    </div>
    <p v-if="error" class="error" data-testid="api-token-error">{{ error }}</p>
    <div v-if="accessToken" class="token-box">
      <textarea
        readonly
        rows="4"
        :value="accessToken"
        data-testid="api-token-value"
      />
      <button type="button" data-testid="api-token-copy" @click="copyToken">
        {{ copied ? "Copied" : "Copy token" }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.api-token-helper {
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  padding: 1rem 1.1rem;
  margin: 1rem 0 1.5rem;
  background: var(--vp-c-bg-soft);
}
.hint {
  margin: 0 0 0.75rem;
  font-size: 0.9rem;
  color: var(--vp-c-text-2);
}
.row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: flex-end;
}
label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.85rem;
  min-width: 10rem;
  flex: 1;
}
input,
textarea {
  font: inherit;
  padding: 0.4rem 0.55rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
}
button {
  font: inherit;
  padding: 0.45rem 0.85rem;
  border-radius: 6px;
  border: 1px solid var(--vp-c-brand-1);
  background: var(--vp-c-brand-1);
  color: #fff;
  cursor: pointer;
}
button:disabled {
  opacity: 0.6;
  cursor: wait;
}
.error {
  color: var(--vp-c-danger-1, #c0392b);
  margin: 0.75rem 0 0;
  font-size: 0.9rem;
}
.token-box {
  margin-top: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
textarea {
  width: 100%;
  font-family: var(--vp-font-family-mono);
  font-size: 0.8rem;
}
</style>
