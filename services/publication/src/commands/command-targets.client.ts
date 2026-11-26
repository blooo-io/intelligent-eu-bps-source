import {
  resolveServiceAuthHeaders,
  type ServiceAuthSource,
} from "@intelligent/module-template";
import type { PspHandoff } from "./billing-command.types.js";

/**
 * REQ-052 / Task 4.3 — internal HTTP targets of the EWDS command channel.
 * Shapes follow A7-bis (handoff), not the obsolete checkoutUrl sketch.
 */
export interface CommandTargetsPort {
  startPayment(i: {
    invoiceId: string;
    actorId: string;
    surface: "hosted" | "embedded";
    returnUrl?: string;
  }): Promise<{
    paymentId: string;
    status: "succeeded" | "processing" | "requires_action";
    handoff?: PspHandoff;
  }>;
  requestWithdrawal(i: {
    actorId: string;
    currency: string;
  }): Promise<{
    payoutId: string;
    payoutStatus: string;
    amount: number;
    currency: string;
  }>;
  startKyc(i: {
    actorId: string;
    kind: "connect_account" | "identity";
    surface: "hosted" | "embedded";
    returnUrl?: string;
    refreshUrl?: string;
  }): Promise<PspHandoff>;
  setInvoiceStatus(i: {
    invoiceId: string;
    status: string;
    reason: string;
    actorId: string;
    communityId: string;
  }): Promise<{ invoiceId: string; invoiceStatus: string }>;
  sendReminder(i: {
    invoiceId: string;
    actorId: string;
    communityId: string;
  }): Promise<{ invoiceId: string; reminderCount: number }>;
  startRun(i: {
    communityId: string;
    type: "periodic" | "final";
    period: string;
  }): Promise<{ runId: string }>;
  setupPaymentMethod(i: {
    actorId: string;
    surface: "hosted" | "embedded";
    returnUrl?: string;
  }): Promise<{ handoff: PspHandoff }>;
  /** INT-447 / REQ-050 — AC-03 terms acceptance by actorId. */
  acceptTerms(i: {
    actorId: string;
    termsVersion: string;
    selfBillingMandate: boolean;
  }): Promise<{
    termsVersion: string;
    selfBillingMandate: boolean;
    acceptedAt: string;
  }>;
}

/** Maps target HTTP failures to dispatcher error codes (no PII in message). */
export class CommandTargetError extends Error {
  constructor(
    readonly status: number,
    readonly code: "not_found" | "conflict" | "unavailable" | "invalid",
    message = "target request failed",
  ) {
    super(message);
    this.name = "CommandTargetError";
  }
}

export type CommandTargetUrls = {
  paymentsBaseUrl: string;
  invoicingBaseUrl: string;
  notificationBaseUrl: string;
  settlementBaseUrl: string;
  participantsBaseUrl: string;
};

/**
 * HTTP CommandTargetsPort — POST to AC-07 / AC-06 / AC-11 / AC-05 internals.
 */
export class HttpCommandTargetsClient implements CommandTargetsPort {
  constructor(
    private readonly urls: CommandTargetUrls,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly auth: ServiceAuthSource = null,
  ) {}

  async startPayment(i: {
    invoiceId: string;
    actorId: string;
    surface: "hosted" | "embedded";
    returnUrl?: string;
  }) {
    return this.postJson(
      this.urls.paymentsBaseUrl,
      "/internal/v1/payments:start",
      i,
    ) as Promise<{
      paymentId: string;
      status: "succeeded" | "processing" | "requires_action";
      handoff?: PspHandoff;
    }>;
  }

  async requestWithdrawal(i: { actorId: string; currency: string }) {
    return this.postJson(
      this.urls.paymentsBaseUrl,
      "/internal/v1/payouts:request",
      i,
    ) as Promise<{
      payoutId: string;
      payoutStatus: string;
      amount: number;
      currency: string;
    }>;
  }

  async startKyc(i: {
    actorId: string;
    kind: "connect_account" | "identity";
    surface: "hosted" | "embedded";
    returnUrl?: string;
    refreshUrl?: string;
  }) {
    return this.postJson(
      this.urls.paymentsBaseUrl,
      "/internal/v1/kyc:start",
      i,
    ) as Promise<PspHandoff>;
  }

  async setInvoiceStatus(i: {
    invoiceId: string;
    status: string;
    reason: string;
    actorId: string;
    communityId: string;
  }) {
    const { invoiceId, ...body } = i;
    return this.postJson(
      this.urls.invoicingBaseUrl,
      `/internal/v1/invoices/${encodeURIComponent(invoiceId)}/status`,
      body,
    ) as Promise<{ invoiceId: string; invoiceStatus: string }>;
  }

  async sendReminder(i: {
    invoiceId: string;
    actorId: string;
    communityId: string;
  }) {
    // INT-461 — invoice-side REQ-061 on AC-06 (emits PaymentReminderRequested
    // for AC-11). Was incorrectly posting to notification /reminders (404).
    return this.postJson(
      this.urls.invoicingBaseUrl,
      `/internal/v1/invoices/${encodeURIComponent(i.invoiceId)}/reminders`,
      {
        actorId: i.actorId,
        communityId: i.communityId,
        trigger: "manual",
      },
    ) as Promise<{ invoiceId: string; reminderCount: number }>;
  }

  async startRun(i: {
    communityId: string;
    type: "periodic" | "final";
    period: string;
  }) {
    return this.postJson(
      this.urls.settlementBaseUrl,
      "/internal/v1/billing-runs",
      i,
      [202],
    ) as Promise<{ runId: string }>;
  }

  /**
   * A7-bis setupPaymentMethod — posts to payments:start-shaped setup path.
   * Contract gap: no dedicated internal route yet; uses /payment-methods:setup.
   */
  async setupPaymentMethod(i: {
    actorId: string;
    surface: "hosted" | "embedded";
    returnUrl?: string;
  }) {
    return this.postJson(
      this.urls.paymentsBaseUrl,
      "/internal/v1/payment-methods:setup",
      i,
    ) as Promise<{ handoff: PspHandoff }>;
  }

  async acceptTerms(i: {
    actorId: string;
    termsVersion: string;
    selfBillingMandate: boolean;
  }) {
    const { actorId, ...body } = i;
    return this.postJson(
      this.urls.participantsBaseUrl,
      `/internal/v1/participants/${encodeURIComponent(actorId)}/terms-acceptance`,
      body,
    ) as Promise<{
      termsVersion: string;
      selfBillingMandate: boolean;
      acceptedAt: string;
    }>;
  }

  private async postJson(
    baseUrl: string,
    path: string,
    body: unknown,
    okStatuses: number[] = [200],
  ): Promise<unknown> {
    const url = `${baseUrl.replace(/\/$/, "")}${path}`;
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(await resolveServiceAuthHeaders("ac-10-publication", this.auth)),
        },
        body: JSON.stringify(body),
      });
    } catch {
      throw new CommandTargetError(0, "unavailable", "target unreachable");
    }
    if (okStatuses.includes(res.status)) {
      return res.json();
    }
    throw mapStatus(res.status);
  }
}

function mapStatus(status: number): CommandTargetError {
  if (status === 404) return new CommandTargetError(404, "not_found");
  if (status === 409) return new CommandTargetError(409, "conflict");
  if (status === 400) return new CommandTargetError(400, "invalid");
  return new CommandTargetError(status, "unavailable");
}

/** Parse comma-separated return-URL prefixes from env. */
export function parseReturnUrlPrefixes(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
