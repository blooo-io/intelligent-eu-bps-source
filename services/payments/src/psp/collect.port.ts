/** Collect (charge / checkout) port (WS5 Task 5.2 / INT-424). REQ-014, REQ-016. */

import type { PspFailureCategory, PspPaymentMethodType } from "./psp.types.js";

export type PaymentMethodDetails = {
  pspPaymentMethodRef: string;
  type?: PspPaymentMethodType;
  brand?: string;
  last4?: string;
};

export type DirectChargeInput = {
  invoiceId: string;
  amount: string;
  currency: string;
  pspAccountRef: string;
  pspCustomerRef: string;
  pspPaymentMethodRef: string;
  idempotencyKey: string;
};

export type CollectResult = {
  pspPaymentRef: string;
  status: "pending" | "succeeded" | "failed";
  method?: PspPaymentMethodType;
  failureCategory?: PspFailureCategory;
};

export type CheckoutInput = {
  invoiceId: string;
  amount: string;
  currency: string;
  pspAccountRef: string;
  pspCustomerRef: string;
  methods: PspPaymentMethodType[];
  saveForFutureUse: boolean;
  successUrl: string;
  cancelUrl: string;
  idempotencyKey: string;
};

export type CheckoutSession = {
  pspCheckoutRef: string;
  checkoutUrl: string;
  expiresAt: string;
};

export type ChargeSettlement = {
  method: PspPaymentMethodType;
  feeAmount: string;
  feeCurrency: string;
  fundsAvailableAt?: string;
};

export interface CollectPort {
  createPaymentMethodSetup(
    participantId: string,
  ): Promise<{ clientSecret: string }>;
  attachPaymentMethod(
    participantId: string,
    pspPaymentMethodRef: string,
  ): Promise<{ pspPaymentMethodRef: string }>;
  getPaymentMethodDetails(
    pspPaymentMethodRef: string,
  ): Promise<PaymentMethodDetails>;
  ensureCustomer(input: {
    participantId: string;
    pspAccountRef: string;
  }): Promise<{ pspCustomerRef: string }>;
  createDirectCharge(input: DirectChargeInput): Promise<CollectResult>;
  createCheckoutSession(input: CheckoutInput): Promise<CheckoutSession>;
  getChargeSettlement(input: {
    pspPaymentRef: string;
    pspAccountRef: string;
  }): Promise<ChargeSettlement | null>;
  refund(input: {
    pspPaymentRef: string;
    pspAccountRef: string;
  }): Promise<{ status: "refunded" }>;
}

export const COLLECT_PORT = Symbol("COLLECT_PORT");
