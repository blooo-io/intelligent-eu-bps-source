export type PaymentRecord = {
  paymentId: string;
  invoiceId: string;
  participantId: string;
  amount: string;
  currency: string;
  status: "pending" | "succeeded" | "failed" | "cancelled" | "refunded";
  stripePaymentId: string;
  /** INT-355 — Stripe invoice paid on the producer Connect account. */
  stripeInvoiceId?: string;
  failureCategory?: string;
  communityId: string;
  /** INT-376 — producer participant paid by this attempt. */
  payeeId?: string;
  /** Payment method label for KPI TE-2 (REQ-046). */
  method?: string;
  /** End-to-end processing time in ms (REQ-046 / KPI TE-2). */
  processingTimeMs?: number;
};

export type AccountRecord = {
  participantId: string;
  stripeAccountId: string | null;
  paymentMethodId: string | null;
  kycStatus: string;
  role: "consumer" | "producer" | "prosumer";
  communityId: string;
};

export type PaymentWrite = { row: PaymentRecord };

/**
 * INT-356 — payment attempts are recorded and committed with the outbox.
 * Account rows stay on the INT-228 payment_accounts table.
 */
export class PaymentsStore {
  private readonly payments = new Map<string, PaymentRecord>();
  private readonly accounts = new Map<string, AccountRecord>();
  private recording = false;
  private writes: PaymentWrite[] = [];

  beginRecording(): void {
    this.recording = true;
    this.writes = [];
  }

  takeRecording(): PaymentWrite[] {
    this.recording = false;
    return this.writes.splice(0);
  }

  stopRecording(): void {
    this.recording = false;
    this.writes = [];
  }

  snapshot(): string {
    return JSON.stringify({
      payments: [...this.payments.values()],
      accounts: [...this.accounts.values()],
    });
  }

  restore(snapshot: string): void {
    const data = JSON.parse(snapshot) as {
      payments: PaymentRecord[];
      accounts: AccountRecord[];
    };
    const recording = this.recording;
    this.recording = false;
    this.payments.clear();
    this.accounts.clear();
    for (const row of data.accounts) this.putAccount(row);
    for (const row of data.payments) this.putPayment(row);
    this.recording = recording;
  }

  reset(): void {
    this.payments.clear();
    this.accounts.clear();
  }

  putAccount(row: AccountRecord): void {
    this.accounts.set(row.participantId, { ...row });
  }

  getAccount(participantId: string): AccountRecord | undefined {
    const row = this.accounts.get(participantId);
    return row ? { ...row } : undefined;
  }

  putPayment(row: PaymentRecord): void {
    this.payments.set(row.paymentId, { ...row });
    if (this.recording) this.writes.push({ row: { ...row } });
  }

  getPayment(paymentId: string): PaymentRecord | undefined {
    const row = this.payments.get(paymentId);
    return row ? { ...row } : undefined;
  }

  findByStripePaymentId(stripePaymentId: string): PaymentRecord | undefined {
    for (const row of this.payments.values()) {
      if (row.stripePaymentId === stripePaymentId) {
        return { ...row };
      }
    }
    return undefined;
  }

  /** Latest payment attempt for a Stripe invoice (Connect invoice.* webhooks). */
  findByStripeInvoiceId(stripeInvoiceId: string): PaymentRecord | undefined {
    let found: PaymentRecord | undefined;
    for (const row of this.payments.values()) {
      if (row.stripeInvoiceId === stripeInvoiceId) {
        found = row;
      }
    }
    return found ? { ...found } : undefined;
  }

  findSucceededByInvoiceId(invoiceId: string): PaymentRecord | undefined {
    for (const row of this.payments.values()) {
      if (row.invoiceId === invoiceId && row.status === "succeeded") {
        return { ...row };
      }
    }
    return undefined;
  }
}
