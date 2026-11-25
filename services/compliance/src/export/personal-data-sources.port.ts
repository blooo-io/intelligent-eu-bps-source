import {
  resolveServiceAuthHeaders,
  type ServiceAuthSource,
} from "@intelligent/module-template";

/**
 * REQ-013 / Task 3.20 — personal-data sources for the DSAR export.
 * AC-12 assembles the payload on each GET and never stores it.
 */

export type ParticipantPersonalData = {
  participantId: string;
  communityId: string;
  role: "consumer" | "producer" | "prosumer";
  source: "ewds" | "import";
  marketActorId: string;
  meterId: string;
  profile: { name: string; address: string; email: string };
  postalAddress: {
    street: string;
    postalCode: string;
    city: string;
    country: string;
  } | null;
  phone: string | null;
  idpUserId: string | null;
  consents: {
    termsVersion: string | null;
    termsAcceptedAt: string | null;
    selfBillingMandate: boolean;
  };
  readiness: string;
  kycVerified: boolean;
};

export type PaymentAccountPersonalData = {
  participantId: string;
  pspAccountRef: string | null;
  paymentMethodPresent: boolean;
  kycStatus: "none" | "pending" | "verified" | "rejected";
  kycVerified: boolean;
  kycVerifiedAt: string | null;
  payoutAccountVerified: boolean;
  kycLog: Array<{
    at: string;
    source: string;
    kycStatus: string;
    pspEventId?: string;
  }>;
};

export type InvoiceSummary = {
  invoiceId: string;
  legalNumber: string | null;
  period: string;
  partyRole: "issuer" | "addressee";
  total: string;
  currency: string;
  status: string;
  issuedAt: string | null;
};

export type PersonalDataSources = {
  getParticipantPersonalData(
    participantId: string,
  ): Promise<ParticipantPersonalData>;
  getPaymentAccountPersonalData(
    participantId: string,
  ): Promise<PaymentAccountPersonalData | null>;
  listInvoices(participantId: string): Promise<InvoiceSummary[]>;
};

export const PERSONAL_DATA_SOURCES = Symbol("PERSONAL_DATA_SOURCES");

const DEFAULT_COMMUNITY = "c0ffee00-1234-4abc-8def-0123456789ab";

/** Unit-test / local fixture matching the Lisboa DSAR sample (REQ-013). */
export class FixturePersonalDataSources implements PersonalDataSources {
  async getParticipantPersonalData(
    participantId: string,
  ): Promise<ParticipantPersonalData> {
    return {
      participantId,
      communityId: DEFAULT_COMMUNITY,
      role: "consumer",
      source: "ewds",
      marketActorId: "mkt-ewds-lisboa",
      meterId: "m-lisboa-1",
      profile: {
        name: "Ana Silva",
        address: "Rua Augusta 1, 1100-053 Lisboa, PT",
        email: "ana.silva@example.invalid",
      },
      postalAddress: {
        street: "Rua Augusta 1",
        postalCode: "1100-053",
        city: "Lisboa",
        country: "PT",
      },
      phone: "+351910000000",
      idpUserId: "bbbbbbbb-2222-4222-8222-222222222222",
      consents: {
        termsVersion: "v1.0.0",
        termsAcceptedAt: "2026-11-20T12:00:00.000Z",
        selfBillingMandate: false,
      },
      readiness: "Ready",
      kycVerified: true,
    };
  }

  async getPaymentAccountPersonalData(
    participantId: string,
  ): Promise<PaymentAccountPersonalData | null> {
    return {
      participantId,
      pspAccountRef: null,
      paymentMethodPresent: true,
      kycStatus: "verified",
      kycVerified: true,
      kycVerifiedAt: "2026-11-25T10:00:00.000Z",
      payoutAccountVerified: false,
      kycLog: [
        {
          at: "2026-11-25T10:00:00.000Z",
          source: "webhook",
          kycStatus: "verified",
          pspEventId: "evt_1",
        },
      ],
    };
  }

  async listInvoices(participantId: string): Promise<InvoiceSummary[]> {
    void participantId;
    return [
      {
        invoiceId: "inv-dsar-1",
        legalNumber: "SB-2026-11",
        period: "2026-11",
        partyRole: "addressee",
        total: "12.50",
        currency: "EUR",
        status: "Open",
        issuedAt: "2026-11-30T00:00:00.000Z",
      },
      {
        invoiceId: "inv-dsar-2",
        legalNumber: "SB-2026-10",
        period: "2026-10",
        partyRole: "addressee",
        total: "8.00",
        currency: "EUR",
        status: "Paid",
        issuedAt: "2026-10-31T00:00:00.000Z",
      },
      {
        invoiceId: "inv-dsar-3",
        legalNumber: null,
        period: "2026-09",
        partyRole: "issuer",
        total: "5.00",
        currency: "EUR",
        status: "Open",
        issuedAt: "2026-09-30T00:00:00.000Z",
      },
    ];
  }
}

type HttpBases = {
  participants: string;
  payments: string;
  invoicing: string;
};

/**
 * HTTP sources against AC-03 / AC-06 / AC-07 internal endpoints (Tasks 3.18 / 3.19).
 */
export class HttpPersonalDataSources implements PersonalDataSources {
  constructor(
    private readonly bases: HttpBases,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly auth: ServiceAuthSource = null,
  ) {}

  async getParticipantPersonalData(
    participantId: string,
  ): Promise<ParticipantPersonalData> {
    const url = `${trim(this.bases.participants)}/internal/v1/participants/${participantId}/personal-data`;
    const res = await this.fetchImpl(url, {
      method: "GET",
      headers: {
        ...(await resolveServiceAuthHeaders("ac-12-compliance", this.auth)),
      },
    });
    if (!res.ok) {
      throw new Error(
        `participants personal-data failed with ${res.status}`,
      );
    }
    return (await res.json()) as ParticipantPersonalData;
  }

  async getPaymentAccountPersonalData(
    participantId: string,
  ): Promise<PaymentAccountPersonalData | null> {
    const url = `${trim(this.bases.payments)}/internal/v1/payment-accounts/${participantId}/personal-data`;
    const res = await this.fetchImpl(url, {
      method: "GET",
      headers: {
        ...(await resolveServiceAuthHeaders("ac-12-compliance", this.auth)),
      },
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(
        `payments personal-data failed with ${res.status}`,
      );
    }
    return (await res.json()) as PaymentAccountPersonalData;
  }

  async listInvoices(participantId: string): Promise<InvoiceSummary[]> {
    const url = `${trim(this.bases.invoicing)}/internal/v1/participants/${participantId}/invoices`;
    const res = await this.fetchImpl(url, {
      method: "GET",
      headers: {
        ...(await resolveServiceAuthHeaders("ac-12-compliance", this.auth)),
      },
    });
    if (!res.ok) {
      throw new Error(
        `invoicing list invoices failed with ${res.status}`,
      );
    }
    const body = (await res.json()) as InvoiceSummary[] | { items?: InvoiceSummary[] };
    return Array.isArray(body) ? body : (body.items ?? []);
  }
}

/**
 * Prefer HTTP when all three internal bases are set; otherwise the Lisboa fixture
 * (unit tests / local without peer services).
 * INT-440 — NODE_ENV=production refuses the Ana Silva fixture (cluster must wire peers).
 */
export function createPersonalDataSources(
  env: NodeJS.ProcessEnv = process.env,
): PersonalDataSources {
  const participants = env.PARTICIPANTS_INTERNAL_URL;
  const payments = env.PAYMENTS_INTERNAL_URL;
  const invoicing = env.INVOICING_INTERNAL_URL;
  if (participants && payments && invoicing) {
    return new HttpPersonalDataSources({
      participants,
      payments,
      invoicing,
    });
  }
  if (env.NODE_ENV === "production") {
    throw new Error(
      "PARTICIPANTS_INTERNAL_URL, PAYMENTS_INTERNAL_URL and INVOICING_INTERNAL_URL are required when NODE_ENV=production (FixturePersonalDataSources / Ana Silva refused)",
    );
  }
  return new FixturePersonalDataSources();
}

function trim(base: string): string {
  return base.replace(/\/$/, "");
}
