<script setup lang="ts">
/**
 * INT-403 / INT-404 — username/password → Keycloak access_token for Try it out.
 * Empty form (no credentials). Client-side cooldown complements Keycloak brute-force
 * and APISIX limit-req on the token path.
 */
import { computed, ref } from "vue";

const props = withDefaults(
  defineProps<{
    tokenUrl?: string;
    clientId?: string;
    /** Max failed attempts before a longer lockout in this browser tab. */
    maxFailures?: number;
    /** Minimum ms between submits (any outcome). */
    minIntervalMs?: number;
  }>(),
  {
    tokenUrl:
      "https://auth.intelligent-eu-bp.blooo.dev/realms/int/protocol/openid-connect/token",
    clientId: "docs",
    maxFailures: 5,
    minIntervalMs: 2000,
  },
);

const username = ref("");
const password = ref("");
const busy = ref(false);
const error = ref("");
const accessToken = ref("");
const copied = ref(false);
const failures = ref(0);
const cooldownUntil = ref(0);
const nowTick = ref(Date.now());

let tickTimer: ReturnType<typeof setInterval> | null = null;

function ensureTick() {
  if (tickTimer) return;
  tickTimer = setInterval(() => {
    nowTick.value = Date.now();
    if (nowTick.value >= cooldownUntil.value && tickTimer) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
  }, 250);
}

const cooldownSeconds = computed(() => {
  const left = Math.ceil((cooldownUntil.value - nowTick.value) / 1000);
  return left > 0 ? left : 0;
});

const locked = computed(() => cooldownSeconds.value > 0);

function armCooldown(ms: number) {
  cooldownUntil.value = Date.now() + ms;
  ensureTick();
}

async function fetchToken() {
  if (busy.value || locked.value) return;
  const user = username.value.trim();
  if (!user || !password.value) {
    error.value = "Username and password are required.";
    return;
  }

  busy.value = true;
  error.value = "";
  accessToken.value = "";
  copied.value = false;
  // Always space attempts — reduces spray even before the IdP responds.
  armCooldown(props.minIntervalMs);

  try {
    const body = new URLSearchParams({
      grant_type: "password",
      client_id: props.clientId,
      username: user,
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
      failures.value += 1;
      // Exponential cool-down after repeated failures (caps at 5 minutes).
      const backoff = Math.min(
        60_000 * 2 ** Math.max(0, failures.value - 1),
        300_000,
      );
      if (failures.value >= props.maxFailures) {
        armCooldown(backoff);
        error.value =
          "Too many failed attempts. Wait before trying again (IdP rate limits also apply).";
      } else {
        armCooldown(Math.max(props.minIntervalMs, Math.min(backoff, 30_000)));
        error.value =
          json.error_description ||
          json.error ||
          `Token request failed (${res.status})`;
      }
      return;
    }
    failures.value = 0;
    accessToken.value = json.access_token;
    // Clear password from the DOM after a successful mint.
    password.value = "";
  } catch (err) {
    failures.value += 1;
    armCooldown(Math.max(props.minIntervalMs, 5_000));
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
      Authorization</strong> as <code>Bearer &lt;token&gt;</code>. Credentials are
      not stored on this site.
    </p>
    <div class="row">
      <label>
        Username
        <input
          v-model="username"
          autocomplete="username"
          data-testid="api-token-username"
        />
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
      <button
        type="button"
        :disabled="busy || locked"
        data-testid="api-token-submit"
        @click="fetchToken"
      >
        <template v-if="busy">Requesting…</template>
        <template v-else-if="locked">Wait {{ cooldownSeconds }}s</template>
        <template v-else>Get access token</template>
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
  cursor: not-allowed;
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
