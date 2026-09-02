/**
 * Shared spawn env for operator scripts.
 * Never inherits ambient PATH (javascript:S4036); only a fixed system PATH.
 */

export const OPERATOR_PATH =
  "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";

/** Env keys operator CLIs may need; PATH is never copied from the parent. */
const PASS_THROUGH_KEYS = [
  "HOME",
  "USER",
  "LOGNAME",
  "SHELL",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TZ",
  "TERM",
  "TMPDIR",
  "KUBECONFIG",
  "ARGOCD_GITHUB_TOKEN",
  "SONAR_TOKEN",
  "SONAR_HOST_URL",
  "SONAR_ORGANIZATION",
  "SONAR_SCANNER_IMAGE",
  "SONAR_LCOV_REPORT_PATHS",
  "SONAR_ADMIN_CURRENT_PASSWORD",
  "GITHUB_SHA",
  "GITHUB_EVENT_NAME",
  "GITHUB_REF_NAME",
  "GITHUB_HEAD_REF",
  "GITHUB_BASE_REF",
  "GITHUB_REPOSITORY",
  "GITHUB_EVENT_PULL_REQUEST_NUMBER",
  "GITHUB_ACTIONS",
  "CI",
  "NODE_ENV",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "E2E_BASE_URL",
  "E2E_SKIP_AUTH",
];

/** @param {NodeJS.ProcessEnv} [overrides] */
export function operatorEnv(overrides = {}) {
  /** @type {NodeJS.ProcessEnv} */
  const env = { PATH: OPERATOR_PATH };
  for (const key of PASS_THROUGH_KEYS) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  return { ...env, ...overrides, PATH: overrides.PATH ?? OPERATOR_PATH };
}
