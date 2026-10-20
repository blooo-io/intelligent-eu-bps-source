import { resolveServiceAuthHeaders, type ServiceAuthSource } from "@intelligent/module-template";
/**
 * Resolve payment-notice recipient e-mail (INT-274 / REQ-017).
 * Prefer AC-03 profile; local registerRecipient remains for unit tests.
 */
export interface RecipientPort {
  resolveEmail(participantId: string): Promise<string | null>;
}

export const RECIPIENT_PORT = Symbol("RECIPIENT_PORT");

/** In-memory map — used when PARTICIPANTS_INTERNAL_URL is unset (CI). */
export class MapRecipient implements RecipientPort {
  constructor(private readonly byId: Map<string, string>) {}

  async resolveEmail(participantId: string): Promise<string | null> {
    return this.byId.get(participantId) ?? null;
  }

  register(participantId: string, email: string): void {
    this.byId.set(participantId, email);
  }
}

/**
 * INT-274 — HTTP GetNotificationContact against AC-03.
 * Selected when PARTICIPANTS_INTERNAL_URL is set (cluster).
 */
export class HttpRecipient implements RecipientPort {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly auth: ServiceAuthSource = null,
  ) {}

  async resolveEmail(participantId: string): Promise<string | null> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/internal/v1/participants/${participantId}/notification-contact`;
    const res = await this.fetchImpl(url, {
      method: "GET",
      headers: {
        ...(await resolveServiceAuthHeaders("ac-11-notification", this.auth)),

      },
    });
    if (res.status === 404) {
      return null;
    }
    if (!res.ok) {
      throw new Error(
        `participants getNotificationContact ${participantId} failed with ${res.status}`,
      );
    }
    const body = (await res.json()) as { email?: string };
    const email = typeof body.email === "string" ? body.email.trim() : "";
    return email || null;
  }
}

export function createRecipient(
  env: NodeJS.ProcessEnv = process.env,
  map = new Map<string, string>(),
): RecipientPort {
  const base = env.PARTICIPANTS_INTERNAL_URL;
  if (base) {
    return new HttpRecipient(base);
  }
  return new MapRecipient(map);
}
