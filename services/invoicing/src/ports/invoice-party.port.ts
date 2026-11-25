import {
  resolveServiceAuthHeaders,
  type ServiceAuthSource,
} from "@intelligent/module-template";

/**
 * REQ-039 / REQ-054 — issuer or addressee for the self-billing PDF.
 * Names stay in the invoicing DB under legal retention; never in events (NFR-015).
 */
export type InvoicePartyDetails = {
  participantId: string;
  name: string;
  address: string;
  selfBillingMandate: { termsVersion: string; acceptedAt: string | null } | null;
};

export interface InvoicePartyPort {
  getInvoiceParty(participantId: string): Promise<InvoicePartyDetails | null>;
}

export const INVOICE_PARTY_PORT = Symbol("INVOICE_PARTY_PORT");

/** CI / unit tests — explicit fixture map. */
export class MapInvoiceParty implements InvoicePartyPort {
  constructor(private readonly byId: Map<string, InvoicePartyDetails>) {}

  async getInvoiceParty(
    participantId: string,
  ): Promise<InvoicePartyDetails | null> {
    return this.byId.get(participantId) ?? null;
  }
}

/**
 * Local / unit default when PARTICIPANTS_INTERNAL_URL is unset.
 * Empty name → issue flow falls back to "Producer"/"Consumer" labels.
 * Cluster uses HttpInvoiceParty when PARTICIPANTS_INTERNAL_URL is set.
 */
export class StubInvoiceParty implements InvoicePartyPort {
  async getInvoiceParty(
    participantId: string,
  ): Promise<InvoicePartyDetails | null> {
    return {
      participantId,
      name: "",
      address: "",
      // Stub mandate so unit tests without AC-03 still pass the BR-09 gate.
      selfBillingMandate: { termsVersion: "v1", acceptedAt: null },
    };
  }
}

/**
 * INT-440 / Task 2.9 — HTTP GetInvoiceParty against AC-03.
 * Used when PARTICIPANTS_INTERNAL_URL is set (cluster / integration).
 */
export class HttpInvoiceParty implements InvoicePartyPort {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly auth: ServiceAuthSource = null,
  ) {}

  async getInvoiceParty(
    participantId: string,
  ): Promise<InvoicePartyDetails | null> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/internal/v1/participants/${participantId}/invoice-party`;
    const res = await this.fetchImpl(url, {
      method: "GET",
      headers: {
        ...(await resolveServiceAuthHeaders("ac-06-invoicing", this.auth)),
      },
    });
    if (res.status === 404) {
      return null;
    }
    if (!res.ok) {
      throw new Error(
        `participants getInvoiceParty ${participantId} failed with ${res.status}`,
      );
    }
    const body = (await res.json()) as {
      participantId?: string;
      name?: string;
      address?: string;
      selfBillingMandate?: {
        termsVersion: string;
        acceptedAt: string | null;
      } | null;
    };
    if (
      typeof body.participantId !== "string" ||
      typeof body.name !== "string" ||
      typeof body.address !== "string"
    ) {
      return null;
    }
    return {
      participantId: body.participantId,
      name: body.name,
      address: body.address,
      selfBillingMandate:
        body.selfBillingMandate === undefined
          ? null
          : body.selfBillingMandate,
    };
  }
}

export function createInvoiceParty(
  env: NodeJS.ProcessEnv = process.env,
): InvoicePartyPort {
  const base = env.PARTICIPANTS_INTERNAL_URL;
  if (base) {
    return new HttpInvoiceParty(base);
  }
  return new StubInvoiceParty();
}
