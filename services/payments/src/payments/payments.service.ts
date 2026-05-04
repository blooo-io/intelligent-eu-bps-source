import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { OutboxService } from "@intelligent/module-template";
import {
  PaymentsStore,
  type AccountRecord,
} from "../domain/store.js";
import {
  INVOICE_LOOKUP,
  type InvoiceLookupPort,
} from "../ports/invoice-lookup.port.js";
import {
  PARTICIPANTS_NOTIFIER,
  type ParticipantsNotifierPort,
} from "../ports/participants-notifier.port.js";
import {
  PAYMENT_ACCOUNTS_STORE,
  type PaymentAccountsStore,
} from "../ports/payment-accounts.store.js";
import {
  PSP_PORT,
  PRODUCER_ONBOARDING_DUE,
  type OnboardingRequirementsSubmission,
  type OnboardingSession,
  type PspPort,
} from "../psp/psp.port.js";

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
    @Inject(INVOICE_LOOKUP) private readonly invoices: InvoiceLookupPort,
    @Inject(PARTICIPANTS_NOTIFIER)
    private readonly participants: ParticipantsNotifierPort,
    @Inject(PAYMENT_ACCOUNTS_STORE)
    private readonly accountsStore: PaymentAccountsStore,
  ) {}

  resetStore(): void {
    this.store.reset();
    this.accountsStore.reset?.();
  }

  /** INT-228 — write memory + durable store (Postgres when DATABASE_URL set). */
  private async saveAccount(row: AccountRecord): Promise<void> {
    this.store.putAccount(row);
    await this.accountsStore.put(row);
  }

  async ensureParticipant(input: {
    participantId: string;
    communityId: string;
    role: "consumer" | "producer" | "prosumer";
  }): Promise<void> {
    if (this.store.getAccount(input.participantId)) {
      return;
    }
    const durable = await this.accountsStore.get(input.participantId);
    if (durable) {
      this.store.putAccount(durable);
      return;
    }
    await this.saveAccount({
      participantId: input.participantId,
      stripeAccountId: null,
      paymentMethodId: null,
      kycStatus: "none",
      role: input.role,
      communityId: input.communityId,
    });
  }

  /**
   * INT-228 — GetPaymentAccount for AC-06 (Stripe Connect master, TP-7).
   */
  async getPaymentAccount(participantId: string): Promise<
    AccountRecord & { chargesEnabled?: boolean }
  > {
    let row = this.store.getAccount(participantId);
    if (!row) {
      row = await this.accountsStore.get(participantId);
      if (row) this.store.putAccount(row);
    }
    if (!row) {
      throw new NotFoundException(`Unknown payment account ${participantId}`);
    }
    let chargesEnabled: boolean | undefined;
    if (row.stripeAccountId) {
      try {
        const session = await this.psp.getAccountSession(row.stripeAccountId);
        chargesEnabled = session.status === "complete";
      } catch {
        chargesEnabled = false;
      }
    }
    return { ...row, chargesEnabled };
  }

  /**
   * INT-228 — always create a fresh Stripe Connect Custom account (test KYC)
   * when fresh=true so each operator/seed run leaves Dashboard-visible entities.
   */
  async provisionPaymentAccount(input: {
    participantId: string;
    communityId: string;
    role: "consumer" | "producer" | "prosumer";
    fresh?: boolean;
  }): Promise<AccountRecord & { chargesEnabled?: boolean }> {
    const fresh = input.fresh !== false;
    await this.ensureParticipant(input);
    const existing = this.store.getAccount(input.participantId)!;

    if (input.role === "consumer") {
      if (!fresh && existing.paymentMethodId) {
        return { ...existing, chargesEnabled: undefined };
      }
      // Consumer SetupIntent creates a Stripe Customer; bind a test PM id in mock,
      // or leave method empty until Elements — seed scripts attach pm_card_visa.
      const setup = await this.psp.createSetupIntent(input.participantId);
      void setup;
      return { ...existing, chargesEnabled: undefined };
    }

    if (!fresh && existing.stripeAccountId) {
      return this.getPaymentAccount(input.participantId);
    }

    const runTag = Date.now().toString(36);
    const submission: OnboardingRequirementsSubmission = {
      tosAccepted: true,
      businessType: "individual",
      country: "FR",
      businessProfileUrl: "https://intelligent.example.test",
      businessProfileMcc: "5734",
      representative: {
        firstName: "Test",
        lastName: `Producer${runTag}`,
        email: `producer-${input.participantId.slice(0, 8)}-${runTag}@example.test`,
        phone: "+33600000000",
        dob: { day: 1, month: 1, year: 1902 },
        address: {
          line1: "address_full_match",
          city: "Paris",
          postalCode: "75001",
          country: "FR",
        },
      },
      // INT-195 — magic test file tokens for charges_enabled.
      identityDocumentFront: "file_identity_document_success",
      identityDocumentAdditionalFront: "file_identity_document_success",
      externalAccount: {
        country: "FR",
        currency: "eur",
        accountNumber: "FR1420041010050500013M02606",
      },
    };

    const accountToken = await this.psp.createAccountToken(submission);
    const created = await this.psp.createProducerAccount({
      participantId: input.participantId,
      accountToken,
      country: "FR",
    });
    const session = await this.psp.submitAccountRequirements(
      created.stripeAccountId,
      {
        businessProfileUrl: submission.businessProfileUrl,
        businessProfileMcc: submission.businessProfileMcc,
        externalAccount: submission.externalAccount,
      },
      "127.0.0.1",
    );
    const verified =
      session.status === "complete" || session.status === "pending_verification";
    await this.saveAccount({
      ...existing,
      stripeAccountId: created.stripeAccountId,
      kycStatus: verified ? "verified" : "pending",
      role: input.role,
      communityId: input.communityId,
    });
    if (verified) {
      await this.emitAccountStatus(input.participantId);
    }
    return {
      ...(await this.getPaymentAccount(input.participantId)),
      chargesEnabled: session.status === "complete",
    };
  }

  async startOnboarding(input: {
    participantId: string;
    communityId: string;
    role: "consumer" | "producer" | "prosumer";
  }): Promise<OnboardingSession> {
    await this.ensureParticipant(input);
    const account = this.store.getAccount(input.participantId)!;

    if (input.role === "producer" || input.role === "prosumer") {
      const stripeAccountId = account.stripeAccountId;
      if (stripeAccountId) {
        return this.psp.getAccountSession(stripeAccountId);
      }
      // INT-191 — defer Custom account create until Account Token is available.
      return {
        mode: "requirements",
        status: "requirements_due",
        currentlyDue: [...PRODUCER_ONBOARDING_DUE],
        eventuallyDue: [],
      };
    }

    // INT-193 — consumer SetupIntent for in-wizard Payment Element.
    if (account.paymentMethodId) {
      return { mode: "elements", status: "complete" };
    }
    const setup = await this.psp.createSetupIntent(input.participantId);
    return {
      mode: "elements",
      status: "requirements_due",
      clientSecret: setup.clientSecret,
    };
  }

  async submitOnboardingRequirements(input: {
    participantId: string;
    communityId: string;
    role: "consumer" | "producer" | "prosumer";
    submission: OnboardingRequirementsSubmission;
    clientIp: string;
  }): Promise<OnboardingSession> {
    if (input.role === "consumer") {
      throw new BadRequestException("Consumers use payment-method link onboarding");
    }
    await this.ensureParticipant(input);
    const account = this.store.getAccount(input.participantId)!;
    let stripeAccountId = account.stripeAccountId;

    if (!stripeAccountId) {
      // INT-191 — create Custom account with account_token (client or server-side).
      let accountToken = input.submission.accountToken;
      if (!accountToken) {
        accountToken = await this.psp.createAccountToken(input.submission);
      }
      const country =
        input.submission.country ??
        input.submission.representative?.address?.country ??
        input.submission.externalAccount?.country ??
        "FR";
      const created = await this.psp.createProducerAccount({
        participantId: input.participantId,
        accountToken,
        country,
      });
      stripeAccountId = created.stripeAccountId;
      await this.saveAccount({
        ...account,
        stripeAccountId,
        kycStatus: "pending",
      });
      // Account tokens are single-use — only non-token fields on the follow-up update.
      const session = await this.psp.submitAccountRequirements(
        stripeAccountId,
        {
          businessProfileUrl: input.submission.businessProfileUrl,
          businessProfileMcc: input.submission.businessProfileMcc,
          externalAccount: input.submission.externalAccount,
        },
        input.clientIp,
      );
      if (session.status === "complete") {
        await this.saveAccount({
          ...this.store.getAccount(input.participantId)!,
          kycStatus: "verified",
        });
        await this.emitAccountStatus(input.participantId);
      }
      return session;
    }

    const session = await this.psp.submitAccountRequirements(
      stripeAccountId,
      input.submission,
      input.clientIp,
    );
    if (session.status === "complete") {
      await this.saveAccount({
        ...this.store.getAccount(input.participantId)!,
        kycStatus: "verified",
      });
      await this.emitAccountStatus(input.participantId);
    }
    return session;
  }

  async attachPaymentMethod(
    participantId: string,
    paymentMethodId: string,
  ): Promise<OnboardingSession> {
    const account = this.store.getAccount(participantId);
    if (!account) {
      throw new NotFoundException("Unknown participant");
    }
    await this.psp.attachPaymentMethod(participantId, paymentMethodId);
    await this.saveAccount({
      ...account,
      paymentMethodId,
    });
    await this.emitAccountStatus(participantId);
    return { mode: "elements", status: "complete" };
  }

  async completeProducerKyc(participantId: string): Promise<void> {
    const account = this.store.getAccount(participantId);
    if (!account?.stripeAccountId) {
      throw new NotFoundException("Unknown producer account");
    }
    await this.saveAccount({ ...account, kycStatus: "verified" });
    await this.emitAccountStatus(participantId);
  }

  async payInvoice(input: {
    invoiceId: string;
    participantId: string;
    communityId: string;
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

    // INT-193 — load amount + producer Connect id from AC-06 (drop fixtures).
    let invoice;
    try {
      invoice = await this.invoices.getInvoice(input.invoiceId);
    } catch {
      throw new NotFoundException(`Unknown invoice ${input.invoiceId}`);
    }
    if (invoice.consumerId !== input.participantId) {
      throw new ForbiddenException("Invoice is not payable by this participant");
    }
    const producerAccount = this.store.getAccount(invoice.producerId);
    const producerStripeAccountId =
      invoice.producerStripeAccountId ??
      producerAccount?.stripeAccountId ??
      undefined;
    if (!producerStripeAccountId) {
      throw new BadRequestException(
        "Producer Connect account required for destination charge",
      );
    }

    const started = Date.now();
    const pspResult = await this.psp.createPayment({
      invoiceId: input.invoiceId,
      amount: invoice.total,
      currency: invoice.currency,
      producerStripeAccountId,
      consumerPaymentMethodId: account.paymentMethodId,
    });
    const processingTimeMs = Math.max(0, Date.now() - started);
    const paymentId = randomUUID();
    this.store.putPayment({
      paymentId,
      invoiceId: input.invoiceId,
      participantId: input.participantId,
      amount: invoice.total,
      currency: invoice.currency,
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
      amount: invoice.total,
      currency: invoice.currency,
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
    if (
      verified.eventType === "payment_intent.succeeded" ||
      verified.eventType === "payment_intent.payment_failed"
    ) {
      const stripePaymentId = String(verified.payload?.stripePaymentId ?? "");
      const row = this.store.findByStripePaymentId(stripePaymentId);
      if (!row) {
        return;
      }
      const status =
        verified.eventType === "payment_intent.succeeded" ? "succeeded" : "failed";
      if (row.status === status) {
        return;
      }
      this.store.putPayment({
        ...row,
        status,
        failureCategory:
          status === "failed"
            ? String(verified.payload?.failureCategory ?? row.failureCategory ?? "declined")
            : row.failureCategory,
      });
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
          status,
        },
      });
    }
  }

  private async emitAccountStatus(participantId: string): Promise<void> {
    const account = this.store.getAccount(participantId);
    if (!account) {
      return;
    }
    const ready =
      account.role === "consumer"
        ? Boolean(account.paymentMethodId)
        : account.kycStatus === "verified";
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
    // INT-193 — sync notify AC-03 until NATS consumer is wired.
    await this.participants.applyPaymentAccountStatus({
      participantId,
      ready,
      reason: ready ? undefined : "payment_account",
    });
  }
}
