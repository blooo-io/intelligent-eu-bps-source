import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  asString,
  IdempotentConsumer,
  OutboxService,
  PassthroughTransaction,
  type RecordingTransaction,
} from "@intelligent/module-template";
import {
  PaymentsStore,
  type AccountRecord,
  type PaymentWrite,
} from "../domain/store.js";
import {
  CONNECTED_CUSTOMERS_STORE,
  type ConnectedCustomerRecord,
  type ConnectedCustomersStore,
} from "../ports/connected-customers.store.js";
import {
  INVOICE_LOOKUP,
  type InvoiceLookupPort,
} from "../ports/invoice-lookup.port.js";
import {
  PARTICIPANTS_NOTIFIER,
  type ParticipantsNotifierPort,
} from "../ports/participants-notifier.port.js";
import {
  PARTICIPANTS_RESOLVER,
  type ParticipantsResolverPort,
} from "../ports/participants-resolver.port.js";
import {
  PAYMENT_ACCOUNTS_STORE,
  type PaymentAccountsStore,
} from "../ports/payment-accounts.store.js";
import {
  PSP_ERASE_PORT,
  type PspErasePort,
} from "../psp/psp-erase.port.js";
import {
  PAYMENT_WEBHOOK_EVENTS,
  PSP_PORT,
  type OnboardingRequirementsSubmission,
  type OnboardingSession,
  type PspPort,
} from "../psp/psp.port.js";

const PRODUCER = "AC-07";

type ProvisionRole = "consumer" | "producer" | "prosumer";

/**
 * AC-07 payments — Stripe Connect test mode (INT-107, BR-12, P-PSP).
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  /** INT-326 — Stripe webhook duplicate deliveries (in-process counter). */
  private webhookDuplicateCount = 0;
  private tx: { run<T>(fn: () => Promise<T> | T): Promise<T> } = new PassthroughTransaction();

  /** INT-356 — payment attempts commit with the outbox when DATABASE_URL is set. */
  useTransaction(tx: RecordingTransaction<PaymentWrite> | PassthroughTransaction): void {
    this.tx = tx;
  }

  constructor(
    @Inject(PaymentsStore) private readonly store: PaymentsStore,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(PSP_PORT) private readonly psp: PspPort,
    @Inject(INVOICE_LOOKUP) private readonly invoices: InvoiceLookupPort,
    @Inject(PARTICIPANTS_NOTIFIER)
    private readonly participants: ParticipantsNotifierPort,
    @Inject(PAYMENT_ACCOUNTS_STORE)
    private readonly accountsStore: PaymentAccountsStore,
    @Inject(PARTICIPANTS_RESOLVER)
    private readonly idpResolver: ParticipantsResolverPort,
    @Inject(PSP_ERASE_PORT) private readonly pspErase: PspErasePort,
    @Inject(IdempotentConsumer) private readonly consumer: IdempotentConsumer,
    @Inject(CONNECTED_CUSTOMERS_STORE)
    private readonly connectedCustomers: ConnectedCustomersStore,
  ) {}

  /** INT-326 — exposed for tests / future Prometheus scrape. */
  getWebhookDuplicateCount(): number {
    return this.webhookDuplicateCount;
  }

  resetStore(): void {
    this.store.reset();
    this.accountsStore.reset?.();
    this.connectedCustomers.reset?.();
  }

  /**
   * INT-355 / REQ-014 — EnsureConnectedCustomer: one Customer per consumer per
   * producer Connect account, reused for every invoice of the pair. AC-06 bills
   * it; AC-07 pays the invoice as that Customer (direct charge).
   */
  async ensureConnectedCustomer(input: {
    participantId: string;
    stripeAccountId: string;
  }): Promise<ConnectedCustomerRecord> {
    if (!input.participantId || !/^acct_/.test(input.stripeAccountId ?? "")) {
      throw new BadRequestException("participantId and acct_ stripeAccountId required");
    }
    const existing = await this.connectedCustomers.get(
      input.participantId,
      input.stripeAccountId,
    );
    if (existing) {
      return existing;
    }
    const created = await this.psp.createConnectedCustomer(input);
    return this.connectedCustomers.putIfAbsent({
      participantId: input.participantId,
      stripeAccountId: input.stripeAccountId,
      stripeCustomerId: created.stripeCustomerId,
    });
  }

  /** INT-228 — write memory + durable store (Postgres when DATABASE_URL set). */
  private async saveAccount(row: AccountRecord): Promise<void> {
    this.store.putAccount(row);
    await this.accountsStore.put(row);
  }

  /** INT-233 — load durable payment account into memory when present. */
  private async hydrateAccount(
    participantId: string,
  ): Promise<AccountRecord | undefined> {
    let row = this.store.getAccount(participantId);
    if (row) {
      return row;
    }
    row = await this.accountsStore.get(participantId);
    if (row) {
      this.store.putAccount(row);
    }
    return row;
  }

  /**
   * INT-230 / INT-251 — JWT `sub` may be Keycloak idpUserId; map to participantId via AC-03.
   * Prefer IdP resolution first so a durable row wrongly keyed by the IdP sub
   * (from a prior failed resolve) cannot shadow the registry participant.
   * Falls back to the raw id when no IdP binding exists (S1 fixture UUIDs).
   */
  async resolveCallerParticipantId(subOrParticipantId: string): Promise<{
    participantId: string;
    communityId?: string;
  }> {
    const resolved = await this.idpResolver.resolveByIdpSub(subOrParticipantId);
    if (resolved) {
      await this.hydrateAccount(resolved.participantId);
      return resolved;
    }
    const existing = await this.hydrateAccount(subOrParticipantId);
    if (existing) {
      return {
        participantId: existing.participantId,
        communityId: existing.communityId,
      };
    }
    return { participantId: subOrParticipantId };
  }

  async ensureParticipant(input: {
    participantId: string;
    communityId: string;
    role: ProvisionRole;
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
  private seedProducerSubmission(
    participantId: string,
  ): OnboardingRequirementsSubmission {
    const runTag = Date.now().toString(36);
    return {
      tosAccepted: true,
      businessType: "individual",
      country: "FR",
      businessProfileUrl: "https://accessible.stripe.com",
      businessProfileMcc: "5734",
      representative: {
        firstName: "Test",
        lastName: `Producer${runTag}`,
        email: `producer-${participantId.slice(0, 8)}-${runTag}@example.com`,
        phone: "+33600000000",
        dob: { day: 1, month: 1, year: 1902 },
        address: {
          line1: "address_full_match",
          city: "Paris",
          postalCode: "75001",
          country: "FR",
        },
      },
      identityDocumentFront: "file_identity_document_success",
      identityDocumentAdditionalFront: "file_identity_document_success",
      externalAccount: {
        country: "FR",
        currency: "eur",
        accountNumber: "FR1420041010050500013M02606",
      },
    };
  }

  private async submitSeedProducerRequirements(
    stripeAccountId: string,
    submission: OnboardingRequirementsSubmission,
  ): Promise<OnboardingSession> {
    try {
      return await this.psp.submitAccountRequirements(
        stripeAccountId,
        {
          businessProfileUrl: submission.businessProfileUrl,
          businessProfileMcc: submission.businessProfileMcc,
          externalAccount: submission.externalAccount,
        },
        "127.0.0.1",
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/url/i.test(msg)) {
        throw err;
      }
      return this.psp.submitAccountRequirements(
        stripeAccountId,
        {
          businessProfileMcc: submission.businessProfileMcc,
          externalAccount: submission.externalAccount,
        },
        "127.0.0.1",
      );
    }
  }

  private async attachProsumerSeedPaymentMethod(
    participantId: string,
    existing: AccountRecord,
  ): Promise<void> {
    if (existing.paymentMethodId) return;
    await this.psp.createSetupIntent(participantId);
    await this.psp.attachPaymentMethod(participantId, "pm_card_visa");
    await this.saveAccount({
      ...this.store.getAccount(participantId)!,
      paymentMethodId: "pm_card_visa",
    });
  }

  private async provisionConsumerAccount(
    input: {
      participantId: string;
      fresh?: boolean;
    },
    existing: AccountRecord,
  ): Promise<AccountRecord & { chargesEnabled?: boolean }> {
    const fresh = input.fresh !== false;
    if (!fresh && existing.paymentMethodId) {
      return { ...existing, chargesEnabled: undefined };
    }
    await this.psp.createSetupIntent(input.participantId);
    return { ...existing, chargesEnabled: undefined };
  }

  async provisionPaymentAccount(input: {
    participantId: string;
    communityId: string;
    role: ProvisionRole;
    fresh?: boolean;
  }): Promise<AccountRecord & { chargesEnabled?: boolean }> {
    const fresh = input.fresh !== false;
    await this.ensureParticipant(input);
    const existing = this.store.getAccount(input.participantId)!;

    if (input.role === "consumer") {
      return this.provisionConsumerAccount(input, existing);
    }

    if (!fresh && existing.stripeAccountId) {
      return this.getPaymentAccount(input.participantId);
    }

    const submission = this.seedProducerSubmission(input.participantId);
    const accountToken = await this.psp.createAccountToken(submission);
    const created = await this.psp.createProducerAccount({
      participantId: input.participantId,
      accountToken,
      country: "FR",
    });
    await this.saveAccount({
      ...existing,
      stripeAccountId: created.stripeAccountId,
      kycStatus: "pending",
      role: input.role,
      communityId: input.communityId,
    });
    const session = await this.submitSeedProducerRequirements(
      created.stripeAccountId,
      submission,
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
      if (input.role === "prosumer") {
        await this.attachProsumerSeedPaymentMethod(input.participantId, existing);
      }
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
    role: ProvisionRole;
  }): Promise<OnboardingSession> {
    await this.ensureParticipant(input);
    const account = this.store.getAccount(input.participantId)!;

    // INT-269 — producer: Connect only. Prosumer: Connect first, then Elements.
    if (input.role === "producer") {
      return this.startProducerOnboarding(account);
    }
    if (input.role === "prosumer") {
      if (!account.stripeAccountId || account.kycStatus !== "verified") {
        const connect = await this.startProducerOnboarding(account);
        if (connect.status !== "complete") return connect;
      }
      // INT-362 — Connect done (possibly just now): continue to the card step.
      return this.startConsumerElementsOnboarding(
        input.participantId,
        this.store.getAccount(input.participantId)!,
      );
    }

    // INT-193 — consumer SetupIntent for in-wizard Payment Element.
    return this.startConsumerElementsOnboarding(input.participantId, account);
  }

  /**
   * INT-362 — embedded Connect onboarding. The first call creates the
   * Stripe-collected account (producer pays fees and bears disputes); every
   * call re-reads Stripe (TP-7), so the portal refreshes the status by calling
   * Start again when the embedded component exits.
   */
  private async startProducerOnboarding(
    account: AccountRecord,
  ): Promise<OnboardingSession> {
    let stripeAccountId = account.stripeAccountId;
    if (!stripeAccountId) {
      const created = await this.psp.createEmbeddedProducerAccount({
        participantId: account.participantId,
        country: "FR",
      });
      stripeAccountId = created.stripeAccountId;
      await this.saveAccount({ ...account, stripeAccountId, kycStatus: "pending" });
    }
    const status = await this.psp.getAccountSession(stripeAccountId);
    if (status.status === "complete") {
      // account.updated may lag behind the component exit; sync readiness here too.
      if (this.store.getAccount(account.participantId)?.kycStatus !== "verified") {
        await this.completeProducerKyc(account.participantId);
      }
      return { ...status, mode: "embedded" };
    }
    const { clientSecret } =
      await this.psp.createAccountOnboardingSession(stripeAccountId);
    return { ...status, mode: "embedded", clientSecret };
  }

  private async startConsumerElementsOnboarding(
    participantId: string,
    account: AccountRecord,
  ): Promise<OnboardingSession> {
    if (account.paymentMethodId) {
      // INT-255 — durable PM may already exist while AC-03 readiness lags;
      // re-notify so Ready chrome stays aligned with Stripe master (TP-7).
      // Best-effort: never fail Start when the PM is already on file.
      try {
        await this.emitAccountStatus(participantId);
      } catch {
        // Participants notify may 5xx during rollout; session is still complete.
      }
      return { mode: "elements", status: "complete" };
    }
    const setup = await this.psp.createSetupIntent(participantId);
    return {
      mode: "elements",
      status: "requirements_due",
      clientSecret: setup.clientSecret,
    };
  }

  async submitOnboardingRequirements(input: {
    participantId: string;
    communityId: string;
    role: ProvisionRole;
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

  /**
   * INT-255 — public GET /me/payment-account for Ready Payment method /
   * Payout account UI. Brand/last4 from Stripe (TP-7); not persisted.
   */
  private async loadStoredAccount(
    participantId: string,
  ): Promise<AccountRecord | undefined> {
    let row = this.store.getAccount(participantId);
    if (!row) {
      row = await this.accountsStore.get(participantId);
      if (row) this.store.putAccount(row);
    }
    return row;
  }

  private async paymentMethodSummary(row: AccountRecord) {
    if (!row.paymentMethodId) {
      return { brand: undefined, last4: undefined, method: undefined };
    }
    const details = await this.psp.getPaymentMethodDetails(row.paymentMethodId);
    return { brand: details.brand, last4: details.last4, method: details.type };
  }

  private async connectAccountSummary(row: AccountRecord) {
    if (!row.stripeAccountId) {
      return {
        stripeAccountId: undefined,
        dashboardUrl: undefined,
        connectStatus: undefined,
      };
    }
    let connectStatus:
      | "requirements_due"
      | "pending_verification"
      | "complete"
      | undefined;
    try {
      const session = await this.psp.getAccountSession(row.stripeAccountId);
      connectStatus = session.status;
    } catch {
      connectStatus =
        row.kycStatus === "verified" ? "complete" : "requirements_due";
    }
    return {
      stripeAccountId: row.stripeAccountId,
      dashboardUrl: `https://dashboard.stripe.com/test/connect/accounts/${row.stripeAccountId}`,
      connectStatus,
    };
  }

  private myPaymentAccountStatus(
    row: AccountRecord,
    connectStatus:
      | "requirements_due"
      | "pending_verification"
      | "complete"
      | undefined,
  ): "complete" | "requirements_due" | "pending_verification" {
    if (this.isPaymentAccountReady(row)) {
      return "complete";
    }
    if (connectStatus) {
      return connectStatus;
    }
    return row.paymentMethodId ? "complete" : "requirements_due";
  }

  async getMyPaymentAccount(participantId: string): Promise<{
    status: "none" | "requirements_due" | "pending_verification" | "complete";
    /** INT-276 — card | sepa_debit for Ready Payment method UI (REQ-014). */
    method?: string;
    brand?: string;
    last4?: string;
    stripeAccountId?: string;
    dashboardUrl?: string;
  }> {
    const row = await this.loadStoredAccount(participantId);
    if (!row) {
      return { status: "none" };
    }

    const { brand, last4, method } = await this.paymentMethodSummary(row);
    const { stripeAccountId, dashboardUrl, connectStatus } =
      await this.connectAccountSummary(row);

    if (brand || last4 || stripeAccountId) {
      return {
        status: this.myPaymentAccountStatus(row, connectStatus),
        method,
        brand,
        last4,
        stripeAccountId,
        dashboardUrl,
      };
    }

    if (row.kycStatus === "verified") {
      return { status: "complete" };
    }
    return { status: "none" };
  }

  async completeProducerKyc(participantId: string): Promise<void> {
    const account = this.store.getAccount(participantId);
    if (!account?.stripeAccountId) {
      throw new NotFoundException("Unknown producer account");
    }
    await this.saveAccount({ ...account, kycStatus: "verified" });
    await this.emitAccountStatus(participantId);
  }

  async payInvoice(input: Parameters<PaymentsService["performPayInvoice"]>[0]) {
    return this.tx.run(() => this.performPayInvoice(input));
  }

  private async performPayInvoice(input: {
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
    // INT-230 — IdP sub → participantId when JWT sub ≠ registry UUID.
    const caller = await this.resolveCallerParticipantId(input.participantId);
    const participantId = caller.participantId;
    const communityId = caller.communityId ?? input.communityId;

    // INT-233 / BR-12 — hydrate durable consumer PM (survives pod restart).
    const account = await this.hydrateAccount(participantId);
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
    if (invoice.consumerId !== participantId) {
      throw new ForbiddenException("Invoice is not payable by this participant");
    }
    const producerAccount = await this.hydrateAccount(invoice.producerId);
    const producerStripeAccountId =
      invoice.producerStripeAccountId ??
      producerAccount?.stripeAccountId ??
      undefined;
    if (!producerStripeAccountId) {
      throw new BadRequestException(
        "Producer Connect account required for direct charge",
      );
    }
    if (!invoice.stripeInvoiceId) {
      throw new BadRequestException(
        "Stripe invoice required for direct charge (REQ-014)",
      );
    }

    // INT-355 — replaying Pay on a settled invoice returns the original payment.
    const prior = this.store.findSucceededByInvoiceId(input.invoiceId);
    if (prior) {
      return {
        paymentId: prior.paymentId,
        invoiceId: prior.invoiceId,
        amount: prior.amount,
        currency: prior.currency,
        status: prior.status,
        method: prior.method,
        processingTimeMs: prior.processingTimeMs,
      };
    }

    const started = Date.now();
    const connected = await this.ensureConnectedCustomer({
      participantId,
      stripeAccountId: producerStripeAccountId,
    });
    const pspResult = await this.psp.createPayment({
      invoiceId: input.invoiceId,
      amount: invoice.total,
      currency: invoice.currency,
      producerStripeAccountId,
      stripeInvoiceId: invoice.stripeInvoiceId,
      connectedCustomerId: connected.stripeCustomerId,
      consumerPaymentMethodId: account.paymentMethodId,
    });
    const processingTimeMs = Math.max(0, Date.now() - started);
    const paymentId = randomUUID();
    // INT-276 / REQ-014 — surface card vs sepa_debit (not hardcoded card).
    let method = "card";
    try {
      const details = await this.psp.getPaymentMethodDetails(
        account.paymentMethodId,
      );
      if (details.type === "sepa_debit") method = "sepa_debit";
      else if (details.type) method = String(details.type);
    } catch {
      /* keep card default */
    }
    this.store.putPayment({
      paymentId,
      invoiceId: input.invoiceId,
      participantId,
      amount: invoice.total,
      currency: invoice.currency,
      status: pspResult.status,
      stripePaymentId: pspResult.stripePaymentId,
      stripeInvoiceId: invoice.stripeInvoiceId,
      failureCategory: pspResult.failureCategory,
      communityId,
      method,
      processingTimeMs,
    });
    await this.outbox.append({
      aggregateType: "Payment",
      aggregateId: paymentId,
      type: "PaymentStatusChanged",
      producer: PRODUCER,
      communityId,
      billingMode: "virtual",
      data: {
        paymentId,
        invoiceId: input.invoiceId,
        status: pspResult.status,
        failureCategory: pspResult.failureCategory,
        method,
        processingTimeMs,
      },
    });
    return {
      paymentId,
      invoiceId: input.invoiceId,
      amount: invoice.total,
      currency: invoice.currency,
      status: pspResult.status,
      method,
      failureCategory: pspResult.failureCategory,
      processingTimeMs,
    };
  }

  private async handleAccountUpdatedWebhook(
    payload: Record<string, unknown> | undefined,
  ): Promise<void> {
    const participantId = asString(payload?.participantId);
    if (!participantId) return;
    // INT-362 — Stripe sends account.updated during embedded onboarding too;
    // complete only once Stripe reports nothing due (TP-7, Stripe is master).
    const stripeAccountId =
      asString(payload?.stripeAccountId) ??
      this.store.getAccount(participantId)?.stripeAccountId;
    if (stripeAccountId) {
      const session = await this.psp.getAccountSession(stripeAccountId);
      if (session.status !== "complete") return;
    }
    await this.completeProducerKyc(participantId);
  }

  /**
   * INT-355 — payment_intent.* and invoice.* (Connect events on the producer
   * account) both resolve to the local Payment and emit PaymentStatusChanged.
   */
  private async handlePaymentStatusWebhook(
    eventType: string,
    payload: Record<string, unknown> | undefined,
  ): Promise<void> {
    const stripePaymentId = asString(payload?.stripePaymentId);
    const stripeInvoiceId = asString(payload?.stripeInvoiceId);
    const row =
      (stripePaymentId
        ? this.store.findByStripePaymentId(stripePaymentId)
        : undefined) ??
      (stripeInvoiceId
        ? this.store.findByStripeInvoiceId(stripeInvoiceId)
        : undefined);
    if (!row) {
      return;
    }
    const status =
      eventType === "payment_intent.succeeded" || eventType === "invoice.paid"
        ? "succeeded"
        : "failed";
    if (row.status === status) {
      return;
    }
    const failureCategory =
      status === "failed"
        ? asString(payload?.failureCategory ?? row.failureCategory, "declined")
        : undefined;
    this.store.putPayment({ ...row, status, failureCategory });
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
        ...(failureCategory ? { failureCategory } : {}),
      },
    });
  }

  async receiveWebhook(rawBody: string, signature: string | undefined): Promise<void> {
    return this.tx.run(() => this.performReceiveWebhook(rawBody, signature));
  }

  private async performReceiveWebhook(rawBody: string, signature: string | undefined): Promise<void> {
    if (!signature) {
      throw new UnauthorizedException("Missing Stripe-Signature");
    }
    const verified = this.psp.verifyWebhook(rawBody, signature);
    if (!verified.ok) {
      throw new BadRequestException("Invalid webhook signature");
    }
    // INT-326 / 04 §7 — dedupe on Stripe Event.id (prefix avoids NATS eventId clash).
    const eventId = verified.eventId?.trim();
    if (!eventId) {
      throw new BadRequestException("Webhook missing event id");
    }
    const result = await this.consumer.handle(
      `stripe:${eventId}`,
      verified,
      async (event) => {
        if (event.eventType === "account.updated") {
          await this.handleAccountUpdatedWebhook(event.payload);
          return;
        }
        const eventType = event.eventType ?? "";
        if ((PAYMENT_WEBHOOK_EVENTS as readonly string[]).includes(eventType)) {
          await this.handlePaymentStatusWebhook(eventType, event.payload);
        }
      },
    );
    if (result.status === "duplicate") {
      this.webhookDuplicateCount += 1;
      this.logger.warn(`Stripe webhook duplicate ignored eventId=${eventId}`);
      return;
    }
    if (result.status === "failed") {
      throw result.error;
    }
  }

  /**
   * INT-269 / REQ-051 — Ready gates by market role:
   * consumer → PM; producer → KYC; prosumer → KYC and PM (P1 when buying).
   */
  private isPaymentAccountReady(account: AccountRecord): boolean {
    if (account.role === "consumer") {
      return Boolean(account.paymentMethodId);
    }
    if (account.role === "prosumer") {
      return (
        account.kycStatus === "verified" && Boolean(account.paymentMethodId)
      );
    }
    return account.kycStatus === "verified";
  }

  private async emitAccountStatus(participantId: string): Promise<void> {
    const account = this.store.getAccount(participantId);
    if (!account) {
      return;
    }
    const ready = this.isPaymentAccountReady(account);
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

  /**
   * REQ-013 / INT-275 — clear local payment-method cache, PSP erase (test mode), ErasureCompleted.
   */
  async applyErasureRequested(input: {
    requestId: string;
    participantId: string;
  }): Promise<{ result: "completed" | "failed" }> {
    const account = await this.hydrateAccount(input.participantId);
    let result: "completed" | "failed" = "completed";
    if (account?.stripeAccountId) {
      try {
        await this.pspErase.erase({
          requestId: input.requestId,
          participantId: input.participantId,
          stripeCustomerId: account.stripeAccountId,
        });
      } catch {
        result = "failed";
      }
    }
    if (account) {
      await this.saveAccount({
        ...account,
        paymentMethodId: null,
      });
    }
    const communityId =
      account?.communityId ?? "a1000000-0000-4000-8000-000000000001";
    await this.outbox.append({
      aggregateType: "DataSubjectRequest",
      aggregateId: input.requestId,
      type: "ErasureCompleted",
      producer: PRODUCER,
      communityId,
      billingMode: "virtual",
      data: {
        requestId: input.requestId,
        module: "AC-07",
        result,
      },
    });
    return { result };
  }
}
