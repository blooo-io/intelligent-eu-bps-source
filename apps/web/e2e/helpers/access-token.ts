import type { Page } from "@playwright/test";

/** Bearer token from the oidc-client-ts session (INT-394). Never log it. */
export async function sessionAccessToken(page: Page): Promise<string> {
  const token = await page.evaluate(() => {
    for (let index = 0; index < sessionStorage.length; index += 1) {
      const key = sessionStorage.key(index);
      if (!key?.startsWith("oidc.user:")) continue;
      const raw = sessionStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as { access_token?: string };
      if (parsed.access_token) return parsed.access_token;
    }
    return "";
  });
  if (!token) {
    throw new Error("No OIDC access token in the browser session");
  }
  return token;
}
