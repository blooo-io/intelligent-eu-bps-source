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
