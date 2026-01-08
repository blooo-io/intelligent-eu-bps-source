import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { OutboxService } from "@intelligent/module-template";
import { PaymentsStore } from "../domain/store.js";
import { PSP_PORT, type PspPort } from "../psp/psp.port.js";

const PRODUCER = "AC-07";

/**
 * AC-07 payments — Stripe Connect test mode (INT-107, BR-12, P-PSP).
 */
@Injectable()
export class PaymentsService {
  constructor(
    @Inject(PaymentsStore) private readonly store: PaymentsStore,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(PSP_PORT) private readonly psp: PspPort,
  ) {}

  resetStore(): void {
    this.store.reset();
  }

  ensureParticipant(input: {
    participantId: string;
    communityId: string;
    role: "consumer" | "producer" | "prosumer";
  }): void {
    if (!this.store.getAccount(input.participantId)) {
      this.store.putAccount({
        participantId: input.participantId,
        stripeAccountId: null,
        paymentMethodId: null,
        kycStatus: "none",
        role: input.role,
        communityId: input.communityId,
      });
    }
  }

  async startOnboarding(input: {
    participantId: string;
    communityId: string;
    role: "consumer" | "producer" | "prosumer";
    returnUrl: string;
  }): Promise<{ url: string }> {
    this.ensureParticipant(input);
    const account = this.store.getAccount(input.participantId)!;

    if (input.role === "producer" || input.role === "prosumer") {
      let stripeAccountId = account.stripeAccountId;
      if (!stripeAccountId) {
        const created = await this.psp.createProducerAccount(input.participantId);
        stripeAccountId = created.stripeAccountId;
        this.store.putAccount({
          ...account,
          stripeAccountId,
          kycStatus: "pending",
        });
      }
      const link = await this.psp.onboardingLink(stripeAccountId, input.returnUrl);
      return { url: link.url };
    }

    // Consumer — hosted payment-method setup link (fixture URL).
    const url = `https://checkout.stripe.com/c/pay/setup_${input.participantId.slice(0, 8)}`;
    return { url };
  }

  async attachPaymentMethod(
    participantId: string,
    paymentMethodId: string,
  ): Promise<void> {
    const account = this.store.getAccount(participantId);
    if (!account) {
      throw new NotFoundException("Unknown participant");
    }
    await this.psp.attachPaymentMethod(participantId, paymentMethodId);
    this.store.putAccount({
      ...account,
      paymentMethodId,
    });
    await this.emitAccountStatus(participantId);
  }

  async completeProducerKyc(participantId: string): Promise<void> {
    const account = this.store.getAccount(participantId);
    if (!account?.stripeAccountId) {
      throw new NotFoundException("Unknown producer account");
    }
    this.store.putAccount({ ...account, kycStatus: "verified" });
    await this.emitAccountStatus(participantId);
  }

  async payInvoice(input: {
    invoiceId: string;
    participantId: string;
    communityId: string;
    amount: string;
    currency: string;
    producerStripeAccountId: string;
  }): Promise<{
    paymentId: string;
    invoiceId: string;
    amount: string;
    currency: string;
    status: string;
    method?: string;
    failureCategory?: string;
    processingTimeMs?: number;
  }> {
    // BR-12 — only test-mode PSP calls.
    const account = this.store.getAccount(input.participantId);
    if (!account?.paymentMethodId) {
      throw new BadRequestException("Consumer payment method required");
    }
    const started = Date.now();
    const pspResult = await this.psp.createPayment({
      invoiceId: input.invoiceId,
      amount: input.amount,
      currency: input.currency,
      producerStripeAccountId: input.producerStripeAccountId,
      consumerPaymentMethodId: account.paymentMethodId,
    });
    const processingTimeMs = Math.max(0, Date.now() - started);
    const paymentId = randomUUID();
    this.store.putPayment({
      paymentId,
      invoiceId: input.invoiceId,
      participantId: input.participantId,
      amount: input.amount,
      currency: input.currency,
      status: pspResult.status,
      stripePaymentId: pspResult.stripePaymentId,
      failureCategory: pspResult.failureCategory,
      communityId: input.communityId,
      method: "card",
      processingTimeMs,
    });
    await this.outbox.append({
      aggregateType: "Payment",
      aggregateId: paymentId,
      type: "PaymentStatusChanged",
      producer: PRODUCER,
      communityId: input.communityId,
      billingMode: "virtual",
      data: {
        paymentId,
        invoiceId: input.invoiceId,
        status: pspResult.status,
        failureCategory: pspResult.failureCategory,
        method: "card",
        processingTimeMs,
      },
    });
    return {
      paymentId,
      invoiceId: input.invoiceId,
      amount: input.amount,
      currency: input.currency,
      status: pspResult.status,
      method: "card",
      failureCategory: pspResult.failureCategory,
      processingTimeMs,
    };
  }

  async receiveWebhook(rawBody: string, signature: string | undefined): Promise<void> {
    if (!signature) {
      throw new UnauthorizedException("Missing Stripe-Signature");
    }
    const verified = this.psp.verifyWebhook(rawBody, signature);
    if (!verified.ok) {
      throw new BadRequestException("Invalid webhook signature");
    }
    // Opaque provider payload beyond signature (NFR-015) — map known test types.
    if (verified.eventType === "account.updated") {
      const participantId = String(verified.payload?.participantId ?? "");
      if (participantId) {
        await this.completeProducerKyc(participantId);
      }
    }
    if (verified.eventType === "payment_intent.succeeded") {
      const stripePaymentId = String(verified.payload?.stripePaymentId ?? "");
      const row = this.store.findByStripePaymentId(stripePaymentId);
      if (row && row.status !== "succeeded") {
        this.store.putPayment({ ...row, status: "succeeded" });
        await this.outbox.append({
          aggregateType: "Payment",
          aggregateId: row.paymentId,
          type: "PaymentStatusChanged",
          producer: PRODUCER,
          communityId: row.communityId,
          billingMode: "virtual",
          data: {
            paymentId: row.paymentId,
            invoiceId: row.invoiceId,
            status: "succeeded",
          },
        });
      }
    }
  }

  private async emitAccountStatus(participantId: string): Promise<void> {
    const account = this.store.getAccount(participantId);
    if (!account) {
      return;
    }
    await this.outbox.append({
      aggregateType: "PaymentAccount",
      aggregateId: participantId,
      type: "PaymentAccountStatusChanged",
      producer: PRODUCER,
      communityId: account.communityId,
      billingMode: "virtual",
      data: {
        participantId,
        kycStatus: account.kycStatus,
        paymentMethodPresent: Boolean(account.paymentMethodId),
      },
    });
  }
}
