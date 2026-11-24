import type { PspFailureCategory, PspPaymentMethodType } from "../psp/psp.types.js";

export type PaymentRecord = {
  paymentId: string;
  invoiceId: string;
  participantId: string;
  amount: string;
  currency: string;
  status:
    | "pending"
    | "requires_action"
    | "succeeded"
    | "failed"
    | "cancelled"
    | "refunded";
  pspAccountRef?: string;
  pspPaymentRef?: string;
  pspCheckoutRef?: string;
  pspInvoiceRef?: string;
  failureCategory?: PspFailureCategory | string;
  communityId: string;
  payeeId?: string;
  method?: PspPaymentMethodType | string;
  processingTimeMs?: number;
  initiatedAt?: string;
  settledAt?: string;
  failedAt?: string;
  feeAmount?: string;
  feeCurrency?: string;
};

export type AccountRecord = {
  participantId: string;
  pspAccountRef: string | null;
  pspPaymentMethodRef: string | null;
  kycStatus: string;
  role: "consumer" | "producer" | "prosumer";
  communityId: string;
};

export type PaymentWrite = { row: PaymentRecord };

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

  findByPspPaymentRef(pspPaymentRef: string): PaymentRecord | undefined {
    for (const row of this.payments.values()) {
      if (row.pspPaymentRef === pspPaymentRef) return { ...row };
    }
    return undefined;
  }

  findByPspCheckoutRef(pspCheckoutRef: string): PaymentRecord | undefined {
    let found: PaymentRecord | undefined;
    for (const row of this.payments.values()) {
      if (row.pspCheckoutRef === pspCheckoutRef) found = row;
    }
    return found ? { ...found } : undefined;
  }

  findByPspInvoiceRef(pspInvoiceRef: string): PaymentRecord | undefined {
    let found: PaymentRecord | undefined;
    for (const row of this.payments.values()) {
      if (row.pspInvoiceRef === pspInvoiceRef) found = row;
    }
    return found ? { ...found } : undefined;
  }

  listByInvoiceId(invoiceId: string): PaymentRecord[] {
    return [...this.payments.values()]
      .filter((row) => row.invoiceId === invoiceId)
      .map((row) => ({ ...row }));
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
