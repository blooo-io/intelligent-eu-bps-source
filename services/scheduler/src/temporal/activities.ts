import { resolveServiceAuthHeaders } from "@intelligent/module-template";
import { resolveOwnerHost } from "./owner-hosts.js";

export type InvokeOwnerInput = {
  ownerModule: string;
  path: string;
  method: "POST" | "GET";
  body: Record<string, unknown>;
};

/**
 * INT-216 — activity that POSTs the job body to the owning module internal API.
 * INT-287 — service JWT / principal headers (was x-principal-* which ModuleAuthGuard ignored).
 */
export async function invokeOwnerModule(input: InvokeOwnerInput): Promise<{
  status: number;
}> {
  const host = resolveOwnerHost(input.ownerModule);
  const base =
    process.env[`OWNER_BASE_URL_${input.ownerModule.replaceAll("-", "_")}`] ??
    process.env.OWNER_BASE_URL_TEMPLATE?.replace("{host}", host) ??
    `http://${host}:8080`;
  const url = `${base.replace(/\/$/, "")}/internal/v1${input.path}`;
  const res = await fetch(url, {
    method: input.method,
    headers: {
      "content-type": "application/json",
      ...(await resolveServiceAuthHeaders("ac-14-scheduler")),
    },
    body: input.method === "POST" ? JSON.stringify(input.body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`owner_http_${res.status}:${text.slice(0, 200)}`);
  }
  return { status: res.status };
}
