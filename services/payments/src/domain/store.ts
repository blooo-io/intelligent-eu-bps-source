export type PaymentRecord = {
  paymentId: string;
  invoiceId: string;
  participantId: string;
  amount: string;
  currency: string;
  status: "pending" | "succeeded" | "failed" | "cancelled" | "refunded";
  stripePaymentId: string;
  failureCategory?: string;
  communityId: string;
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

export class PaymentsStore {
  private payments = new Map<string, PaymentRecord>();
  private accounts = new Map<string, AccountRecord>();

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
}
