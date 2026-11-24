import {
  BadGatewayException,
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
  IdempotentConsumer,
  OutboxService,
  PassthroughTransaction,
  type RecordingTransaction,
} from "@intelligent/module-template";
import { CLOCK, type Clock } from "../domain/clock.js";
import {
  PaymentsStore,
  type AccountRecord,
  type PaymentRecord,
} from "../domain/store.js";
import type { JournalWrite } from "../persistence/payment-journal.js";
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
  COLLECT_PORT,
  type ChargeSettlement,
  type CollectPort,
} from "../psp/collect.port.js";
import {
  PSP_ERASE_PORT,
  type PspErasePort,
} from "../psp/psp-erase.port.js";
import type {
  LegacyOnboardingSession,
  OnboardingRequirementsSubmission,
} from "../psp/psp.legacy.js";
import {
  PAYOUT_EVENTS_HANDLER,
  PSP_ADAPTER,
  PSP_EVENTS_PORT,
  type PayoutEventsHandler,
  type PspEventsPort,
} from "../psp/psp-events.port.js";
import type { PspEvent } from "../psp/psp.types.js";
import type { MockPspAdapter } from "../psp/mock-psp.adapter.js";
import type { StripePspAdapter } from "../psp/stripe-psp.adapter.js";

type PspAdapter = MockPspAdapter | StripePspAdapter;
type OnboardingSession = LegacyOnboardingSession;

const PRODUCER = "AC-07";

type ProvisionRole = "consumer" | "producer" | "prosumer";

export type PayInvoiceInput = {
  invoiceId: string;
  participantId: string;
  communityId: string;
  /** Where the PSP-hosted checkout sends the payer back (A7-bis). */
  returnUrl?: string;
};

export type PayInvoiceResult = {
  paymentId: string;
  invoiceId: string;
  amount: string;
  currency: string;
  status: PaymentRecord["status"];
  method?: string;
  checkoutUrl?: string;
  failureCategory?: string;
  initiatedAt: string;
};

const CHECKOUT_METHODS = ["card", "sepa_debit"] as const;

/**
 * AC-07 payments — Stripe Connect test mode (INT-107, BR-12, P-PSP).
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  /** INT-326 — PSP webhook duplicate deliveries (in-process counter). */
  private webhookDuplicateCount = 0;
  private tx: { run<T>(fn: () => Promise<T> | T): Promise<T> } = new PassthroughTransaction();
  /** REQ-014 — a double click on Pay joins the attempt already running in this pod. */
  private readonly payInFlight = new Map<string, Promise<PayInvoiceResult>>();

  /** INT-356 — payment attempts commit with the outbox when DATABASE_URL is set. */
  useTransaction(tx: RecordingTransaction<JournalWrite> | PassthroughTransaction): void {
    this.tx = tx;
  }

  constructor(
    @Inject(PaymentsStore) private readonly store: PaymentsStore,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(PSP_ADAPTER) private readonly psp: PspAdapter,
    @Inject(INVOICE_LOOKUP) private readonly invoices: InvoiceLookupPort,
    @Inject(PARTICIPANTS_NOTIFIER)
    private readonly participants: ParticipantsNotifierPort,
    @Inject(PAYMENT_ACCOUNTS_STORE)
    private readonly accountsStore: PaymentAccountsStore,
    @Inject(PARTICIPANTS_RESOLVER)
    private readonly idpResolver: ParticipantsResolverPort,
    @Inject(PSP_ERASE_PORT) private readonly pspErase: PspErasePort,
    @Inject(IdempotentConsumer) private readonly consumer: IdempotentConsumer,
    @Inject(COLLECT_PORT) private readonly collect: CollectPort,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(PSP_EVENTS_PORT) private readonly pspEvents: PspEventsPort,
    @Inject(PAYOUT_EVENTS_HANDLER)
    private readonly payoutEvents: PayoutEventsHandler,
  ) {}

  /** INT-326 — exposed for tests / future Prometheus scrape. */
  getWebhookDuplicateCount(): number {
    return this.webhookDuplicateCount;
  }

  resetStore(): void {
    this.store.reset();
    this.accountsStore.reset?.();
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
      pspAccountRef: null,
      pspPaymentMethodRef: null,
      kycStatus: "none",
      role: input.role,
      communityId: input.communityId,
    });
  }

  /**
   * INT-228 — GetPaymentAccount for AC-06 (Stripe Connect master, TP-7).
   */
  private toPaymentAccountApi(
    row: AccountRecord,
    chargesEnabled?: boolean,
  ): {
    participantId: string;
    pspAccountRef: string | null;
    paymentMethodId: string | null;
    kycStatus: string;
    role: AccountRecord["role"];
    communityId: string;
    chargesEnabled?: boolean;
  } {
    return {
      participantId: row.participantId,
      pspAccountRef: row.pspAccountRef,
      paymentMethodId: row.pspPaymentMethodRef,
      kycStatus: row.kycStatus,
      role: row.role,
      communityId: row.communityId,
      chargesEnabled,
    };
  }

  async getPaymentAccount(participantId: string): Promise<
    ReturnType<PaymentsService["toPaymentAccountApi"]>
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
    if (row.pspAccountRef) {
      try {
        const session = await this.psp.getAccountSession(row.pspAccountRef);
        chargesEnabled = session.status === "complete";
      } catch {
        chargesEnabled = false;
      }
    }
    return this.toPaymentAccountApi(row, chargesEnabled);
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
    pspAccountRef: string,
    submission: OnboardingRequirementsSubmission,
  ): Promise<OnboardingSession> {
    try {
      return await this.psp.submitAccountRequirements(
        pspAccountRef,
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
        pspAccountRef,
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
    if (existing.pspPaymentMethodRef) return;
    await this.psp.createSetupIntent(participantId);
    await this.psp.attachPaymentMethod(participantId, "pm_card_visa");
    await this.saveAccount({
      ...this.store.getAccount(participantId)!,
      pspPaymentMethodRef: "pm_card_visa",
    });
  }

  private async provisionConsumerAccount(
    input: {
      participantId: string;
      fresh?: boolean;
    },
    existing: AccountRecord,
  ): Promise<ReturnType<PaymentsService["toPaymentAccountApi"]>> {
    const fresh = input.fresh !== false;
    if (!fresh && existing.pspPaymentMethodRef) {
      return this.toPaymentAccountApi(existing);
    }
    await this.psp.createSetupIntent(input.participantId);
    return this.toPaymentAccountApi(existing);
  }

  async provisionPaymentAccount(input: {
    participantId: string;
    communityId: string;
    role: ProvisionRole;
    fresh?: boolean;
  }): Promise<ReturnType<PaymentsService["toPaymentAccountApi"]>> {
    const fresh = input.fresh !== false;
    await this.ensureParticipant(input);
    const existing = this.store.getAccount(input.participantId)!;

    if (input.role === "consumer") {
      return this.provisionConsumerAccount(input, existing);
    }

    if (!fresh && existing.pspAccountRef) {
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
      pspAccountRef: created.pspAccountRef,
      kycStatus: "pending",
      role: input.role,
      communityId: input.communityId,
    });
    const session = await this.submitSeedProducerRequirements(
      created.pspAccountRef,
      submission,
    );
    const verified =
      session.status === "complete" || session.status === "pending_verification";
    await this.saveAccount({
      ...existing,
      pspAccountRef: created.pspAccountRef,
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
    // INT-230 / INT-394 — JWT sub is the IdP id; AC-03 is keyed by participantId.
    const caller = await this.resolveCallerParticipantId(input.participantId);
    const participantId = caller.participantId;
    await this.ensureParticipant({
      participantId,
      communityId: caller.communityId ?? input.communityId,
      role: input.role,
    });
    const account = this.store.getAccount(participantId)!;

    // INT-269 — producer: Connect only. Prosumer: Connect first, then Elements.
    if (input.role === "producer") {
      return this.startProducerOnboarding(account);
    }
    if (input.role === "prosumer") {
      if (!account.pspAccountRef || account.kycStatus !== "verified") {
        const connect = await this.startProducerOnboarding(account);
        if (connect.status !== "complete") return connect;
      }
      // INT-362 — Connect done (possibly just now): continue to the card step.
      return this.startConsumerElementsOnboarding(
        participantId,
        this.store.getAccount(participantId)!,
      );
    }

    // INT-193 — consumer SetupIntent for in-wizard Payment Element.
    return this.startConsumerElementsOnboarding(participantId, account);
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
    let pspAccountRef = account.pspAccountRef;
    if (!pspAccountRef) {
      const created = await this.psp.createEmbeddedProducerAccount({
        participantId: account.participantId,
        country: "FR",
      });
      pspAccountRef = created.pspAccountRef;
      await this.saveAccount({ ...account, pspAccountRef, kycStatus: "pending" });
    }
    const status = await this.psp.getAccountSession(pspAccountRef);
    if (status.status === "complete") {
      // account.updated may lag behind the component exit; sync readiness here too.
      if (this.store.getAccount(account.participantId)?.kycStatus !== "verified") {
        await this.completeProducerKyc(account.participantId);
      }
      return { ...status, mode: "embedded" };
    }
    const { clientSecret } =
      await this.psp.createAccountOnboardingSession(pspAccountRef);
    return { ...status, mode: "embedded", clientSecret };
  }

  private async startConsumerElementsOnboarding(
    participantId: string,
    account: AccountRecord,
  ): Promise<OnboardingSession> {
    if (account.pspPaymentMethodRef) {
      // INT-255 / ANO-006 — a saved card must update AC-03. Swallowing the
      // notify left the member on TermsAccepted with no next step.
      try {
        await this.emitAccountStatus(participantId, { notFound: "fail" });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "payment account status notify failed";
        throw new BadGatewayException(message);
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
    const caller = await this.resolveCallerParticipantId(input.participantId);
    input = {
      ...input,
      participantId: caller.participantId,
      communityId: caller.communityId ?? input.communityId,
    };
    await this.ensureParticipant(input);
    const account = this.store.getAccount(input.participantId)!;
    let pspAccountRef = account.pspAccountRef;

    if (!pspAccountRef) {
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
      pspAccountRef = created.pspAccountRef;
      await this.saveAccount({
        ...account,
        pspAccountRef,
        kycStatus: "pending",
      });
      // Account tokens are single-use — only non-token fields on the follow-up update.
      const session = await this.psp.submitAccountRequirements(
        pspAccountRef,
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
      pspAccountRef,
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

  /**
   * INT-394 — public card save. Resolve the IdP subject before the account
   * row is created, so Ready is notified on the registry participant.
   */
  async attachCallerPaymentMethod(input: {
    participantId: string;
    communityId: string;
    role: ProvisionRole;
    paymentMethodId: string;
  }): Promise<OnboardingSession> {
    const caller = await this.resolveCallerParticipantId(input.participantId);
    await this.ensureParticipant({
      participantId: caller.participantId,
      communityId: caller.communityId ?? input.communityId,
      role: input.role,
    });
    return this.attachPaymentMethod(caller.participantId, input.paymentMethodId);
  }

  async attachPaymentMethod(
    participantId: string,
    paymentMethodId: string,
  ): Promise<OnboardingSession> {
    const account = this.store.getAccount(participantId);
    if (!account) {
      throw new NotFoundException("Unknown participant");
    }
    try {
      await this.psp.attachPaymentMethod(participantId, paymentMethodId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("payment_method_owned_by_other")) {
        throw new ForbiddenException(
          "Payment method belongs to another participant",
        );
      }
      throw error;
    }
    await this.saveAccount({
      ...account,
      pspPaymentMethodRef: paymentMethodId,
    });
    try {
      await this.emitAccountStatus(participantId, { notFound: "fail" });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "payment account status notify failed";
      throw new BadGatewayException(message);
    }
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
    if (!row.pspPaymentMethodRef) {
      return { brand: undefined, last4: undefined, method: undefined };
    }
    const details = await this.psp.getPaymentMethodDetails(row.pspPaymentMethodRef);
    return { brand: details.brand, last4: details.last4, method: details.type };
  }

  private async connectAccountSummary(row: AccountRecord) {
    if (!row.pspAccountRef) {
      return {
        pspAccountRef: undefined,
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
      const session = await this.psp.getAccountSession(row.pspAccountRef);
      connectStatus = session.status;
    } catch {
      connectStatus =
        row.kycStatus === "verified" ? "complete" : "requirements_due";
    }
    return {
      pspAccountRef: row.pspAccountRef,
      dashboardUrl: `https://dashboard.stripe.com/test/connect/accounts/${row.pspAccountRef}`,
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
    return row.pspPaymentMethodRef ? "complete" : "requirements_due";
  }

  async getMyPaymentAccount(participantId: string): Promise<{
    status: "none" | "requirements_due" | "pending_verification" | "complete";
    /** INT-276 — card | sepa_debit for Ready Payment method UI (REQ-014). */
    method?: string;
    brand?: string;
    last4?: string;
    pspAccountRef?: string;
    dashboardUrl?: string;
  }> {
    const caller = await this.resolveCallerParticipantId(participantId);
    const row = await this.loadStoredAccount(caller.participantId);
    if (!row) {
      return { status: "none" };
    }

    const { brand, last4, method } = await this.paymentMethodSummary(row);
    const { pspAccountRef, dashboardUrl, connectStatus } =
      await this.connectAccountSummary(row);

    if (brand || last4 || pspAccountRef) {
      return {
        status: this.myPaymentAccountStatus(row, connectStatus),
        method,
        brand,
        last4,
        pspAccountRef,
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
    if (!account?.pspAccountRef) {
      throw new NotFoundException("Unknown producer account");
    }
    await this.saveAccount({ ...account, kycStatus: "verified" });
    await this.emitAccountStatus(participantId);
  }

  /**
   * INT-338 / TP-7 — Stripe-backed payment row is the source AC-06 confirms
   * before marking an invoice Paid. Unknown ids are not found.
   */
  getPaymentStatus(paymentId: string): {
    paymentId: string;
    invoiceId: string;
    status: string;
  } {
    const row = this.store.getPayment(paymentId);
    if (!row) {
      throw new NotFoundException(`Unknown payment ${paymentId}`);
    }
    return {
      paymentId: row.paymentId,
      invoiceId: row.invoiceId,
      status: row.status,
    };
  }

  async payInvoice(input: PayInvoiceInput): Promise<PayInvoiceResult> {
    const key = `${input.invoiceId}|${input.participantId}`;
    const running = this.payInFlight.get(key);
    if (running) {
      return running;
    }
    const attempt = this.tx.run(() => this.performPayInvoice(input));
    this.payInFlight.set(key, attempt);
    try {
      return await attempt;
    } finally {
      this.payInFlight.delete(key);
    }
  }

  /**
   * REQ-014 / BR-12 — the consumer pays the producer directly on the
   * producer's PSP account. A saved card is charged off-session; SEPA, or no
   * saved method, goes through a PSP-hosted checkout (B7, A7-bis).
   * `initiatedAt` is the TE-2 start; settlement time comes from the webhook.
   */
  private async performPayInvoice(input: PayInvoiceInput): Promise<PayInvoiceResult> {
    // INT-230 — IdP sub → participantId when JWT sub ≠ registry UUID.
    const caller = await this.resolveCallerParticipantId(input.participantId);
    const participantId = caller.participantId;
    const communityId = caller.communityId ?? input.communityId;

    // INT-233 / BR-12 — hydrate durable consumer PM (survives pod restart).
    const account = await this.hydrateAccount(participantId);

    // INT-193 — load amount + producer PSP account from AC-06.
    let invoice;
    try {
      invoice = await this.invoices.getInvoice(input.invoiceId);
    } catch {
      throw new NotFoundException(`Unknown invoice ${input.invoiceId}`);
    }
    // INT-236 / INT-395 — invoices may name the consumer by registry id or IdP sub.
    if (
      invoice.consumerId !== participantId &&
      invoice.consumerId !== input.participantId
    ) {
      throw new ForbiddenException("Invoice is not payable by this participant");
    }
    // INT-355 — replaying Pay on a settled invoice returns the original payment.
    const prior = this.store.findSucceededByInvoiceId(input.invoiceId);
    if (prior) {
      if (invoice.status !== "Paid") {
        await this.announcePaymentStatus(prior, prior.payeeId ?? invoice.producerId);
      }
      return this.toPayResult(prior);
    }
    // INT-340 — one payment, and only while the invoice is still payable.
    if (
      invoice.status !== "Open" &&
      invoice.status !== "PartiallyPaid" &&
      invoice.status !== "Overdue"
    ) {
      throw new BadRequestException(
        `Invoice status ${invoice.status} is not payable`,
      );
    }
    const attempts = this.store.listByInvoiceId(input.invoiceId);
    const processing = attempts.find((row) => row.status === "pending");
    if (processing) {
      return this.toPayResult(processing);
    }
    const pspAccountRef = await this.producerPspAccountRef(invoice);

    const pspPaymentMethodRef = account?.pspPaymentMethodRef ?? undefined;
    const savedMethod = pspPaymentMethodRef
      ? await this.paymentMethodType(pspPaymentMethodRef)
      : undefined;
    const base = {
      invoiceId: input.invoiceId,
      participantId,
      communityId,
      amount: invoice.total,
      currency: invoice.currency,
      payeeId: invoice.producerId,
      pspAccountRef,
    };

    if (pspPaymentMethodRef && savedMethod === "card") {
      // D2 / A1 — per-charge PM clone on the producer account; no connected Customer.
      const failed = attempts.filter(
        (row) => row.status === "failed" && !row.pspCheckoutRef,
      ).length;
      const idempotencyKey =
        failed === 0 ? `pay:${input.invoiceId}` : `pay:${input.invoiceId}:${failed + 1}`;
      const initiatedAt = this.clock.now().toISOString();
      const charge = await this.collect.createDirectCharge({
        invoiceId: input.invoiceId,
        amount: invoice.total,
        currency: invoice.currency,
        pspAccountRef,
        pspPaymentMethodRef,
        idempotencyKey,
      });
      const row: PaymentRecord = {
        ...base,
        paymentId: randomUUID(),
        status: charge.status,
        pspPaymentRef: charge.pspPaymentRef,
        method: charge.method ?? "card",
        ...(charge.failureCategory ? { failureCategory: charge.failureCategory } : {}),
        initiatedAt,
      };
      this.store.putPayment(row);
      await this.announcePaymentStatus(row, invoice.producerId);
      return this.toPayResult(row);
    }

    if (!input.returnUrl) {
      throw new BadRequestException(
        "returnUrl required for PSP-hosted checkout (A7-bis)",
      );
    }
    const initiatedAt = this.clock.now().toISOString();
    const session = await this.collect.createCheckoutSession({
      invoiceId: input.invoiceId,
      amount: invoice.total,
      currency: invoice.currency,
      pspAccountRef,
      methods: [...CHECKOUT_METHODS],
      saveForFutureUse: true,
      successUrl: input.returnUrl,
      cancelUrl: input.returnUrl,
      idempotencyKey: `co:${input.invoiceId}:${initiatedAt.slice(0, 10)}`,
    });
    const awaiting = attempts.find((row) => row.status === "requires_action");
    if (awaiting?.pspCheckoutRef === session.pspCheckoutRef) {
      return this.toPayResult(awaiting, session.checkoutUrl);
    }
    // The checkout URL is returned to the caller only, never stored (A7-bis).
    const row: PaymentRecord = {
      ...base,
      paymentId: awaiting?.paymentId ?? randomUUID(),
      status: "requires_action",
      pspCheckoutRef: session.pspCheckoutRef,
      initiatedAt,
    };
    this.store.putPayment(row);
    return this.toPayResult(row, session.checkoutUrl);
  }

  private async producerPspAccountRef(invoice: {
    producerId: string;
    producerPspAccountRef?: string;
  }): Promise<string> {
    const producerAccount = await this.hydrateAccount(invoice.producerId);
    const boundAccount = producerAccount?.pspAccountRef || undefined;
    if (
      invoice.producerPspAccountRef &&
      boundAccount &&
      invoice.producerPspAccountRef !== boundAccount
    ) {
      throw new BadRequestException("Producer PSP account does not match AC-07");
    }
    const pspAccountRef = boundAccount ?? invoice.producerPspAccountRef;
    if (!pspAccountRef) {
      throw new BadRequestException(
        "Producer PSP account required for direct charge",
      );
    }
    return pspAccountRef;
  }

  private async paymentMethodType(pspPaymentMethodRef: string): Promise<string> {
    try {
      const details = await this.collect.getPaymentMethodDetails(pspPaymentMethodRef);
      return details.type ?? "card";
    } catch {
      return "card";
    }
  }

  private toPayResult(row: PaymentRecord, checkoutUrl?: string): PayInvoiceResult {
    return {
      paymentId: row.paymentId,
      invoiceId: row.invoiceId,
      amount: row.amount,
      currency: row.currency,
      status: row.status,
      ...(row.method ? { method: row.method } : {}),
      ...(row.failureCategory ? { failureCategory: row.failureCategory } : {}),
      ...(checkoutUrl ? { checkoutUrl } : {}),
      initiatedAt: this.initiatedAtOf(row),
    };
  }

  /** Rows persisted before `initiatedAt` existed fall back to the announce time. */
  private initiatedAtOf(row: PaymentRecord): string {
    return row.initiatedAt ?? this.clock.now().toISOString();
  }

  private async announcePaymentStatus(
    row: PaymentRecord,
    payeeId: string | undefined,
  ): Promise<void> {
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
        payerId: row.participantId,
        ...(payeeId ? { payeeId } : {}),
        status: row.status,
        amount: row.amount,
        currency: row.currency,
        initiatedAt: this.initiatedAtOf(row),
        ...(row.settledAt ? { settledAt: row.settledAt } : {}),
        ...(row.processingTimeMs !== undefined
          ? { processingTimeMs: row.processingTimeMs }
          : {}),
        ...(row.feeAmount
          ? { feeAmount: row.feeAmount, feeCurrency: row.feeCurrency }
          : {}),
        ...(row.method ? { method: row.method } : {}),
        ...(row.failureCategory ? { failureCategory: row.failureCategory } : {}),
      },
    });
  }

  /** INT-376 — rows stored before payeeId existed still name the producer. */
  private async payeeOf(row: PaymentRecord): Promise<string | undefined> {
    if (row.payeeId) return row.payeeId;
    try {
      return (await this.invoices.getInvoice(row.invoiceId)).producerId;
    } catch {
      return undefined;
    }
  }

  private async handleAccountUpdated(event: PspEvent): Promise<void> {
    const participantId = event.participantId;
    if (!participantId) return;
    // INT-362 — the PSP sends account.updated during embedded onboarding too;
    // complete only once it reports nothing due (TP-7, the PSP is master).
    const pspAccountRef =
      event.pspAccountRef ?? this.store.getAccount(participantId)?.pspAccountRef;
    if (pspAccountRef) {
      const session = await this.psp.getAccountSession(pspAccountRef);
      if (session.status !== "complete") return;
    }
    await this.completeProducerKyc(participantId);
  }

  /**
   * The PSP does not order checkout.completed before the payment outcome, so
   * an outcome for an unknown payment ref is linked to the invoice's open checkout.
   */
  private findPaymentForEvent(
    event: PspEvent,
    pspPaymentRef: string,
  ): PaymentRecord | undefined {
    const row = this.store.findByPspPaymentRef(pspPaymentRef);
    if (row || !event.invoiceId) return row;
    const checkout = this.store
      .listByInvoiceId(event.invoiceId)
      .find((candidate) => candidate.pspCheckoutRef && !candidate.pspPaymentRef);
    return checkout ? { ...checkout, pspPaymentRef } : undefined;
  }

  /** REQ-014 / TE-2 — the payer finished the hosted checkout: processing starts now. */
  private async handleCheckoutCompleted(event: PspEvent): Promise<void> {
    const row = event.pspCheckoutRef
      ? this.store.findByPspCheckoutRef(event.pspCheckoutRef)
      : undefined;
    // A row past requires_action was already linked by its outcome event.
    if (row?.status !== "requires_action") return;
    const pending: PaymentRecord = {
      ...row,
      status: "pending",
      pspPaymentRef: event.pspPaymentRef ?? row.pspPaymentRef,
      initiatedAt: event.occurredAt,
    };
    this.store.putPayment(pending);
    await this.announcePaymentStatus(pending, await this.payeeOf(pending));
  }

  /**
   * TE-2 / REQ-046 — settlement time and PSP fee come from the webhook. A
   * synchronous success is still settled here: only `settledAt` ends processing.
   */
  private async handlePaymentSucceeded(event: PspEvent): Promise<void> {
    if (!event.pspPaymentRef) return;
    const row = this.findPaymentForEvent(event, event.pspPaymentRef);
    if (!row || row.settledAt) return;
    const settledAt = event.occurredAt;
    const settled: PaymentRecord = {
      ...row,
      status: "succeeded",
      settledAt,
      ...(row.initiatedAt
        ? {
            processingTimeMs: Math.max(
              0,
              Date.parse(settledAt) - Date.parse(row.initiatedAt),
            ),
          }
        : {}),
      ...(event.method ? { method: event.method } : {}),
    };
    const fee = await this.chargeSettlement(
      settled.paymentId,
      event.pspPaymentRef,
      row.pspAccountRef,
    );
    if (fee) {
      settled.method = fee.method;
      settled.feeAmount = fee.feeAmount;
      settled.feeCurrency = fee.feeCurrency;
    }
    this.store.putPayment(settled);
    await this.announcePaymentStatus(settled, await this.payeeOf(settled));
  }

  /** REQ-046 — a missing fee never blocks settlement; the log carries the paymentId only. */
  private async chargeSettlement(
    paymentId: string,
    pspPaymentRef: string,
    pspAccountRef: string | undefined,
  ): Promise<ChargeSettlement | null> {
    if (!pspAccountRef) return null;
    let fee: ChargeSettlement | null = null;
    try {
      fee = await this.collect.getChargeSettlement({ pspPaymentRef, pspAccountRef });
    } catch {
      fee = null;
    }
    if (!fee) {
      this.logger.warn(`psp.fee_unavailable paymentId=${paymentId}`);
    }
    return fee;
  }

  /** REQ-016 / UAT-016 — failure time and canonical category from the PSP. */
  private async handlePaymentFailed(event: PspEvent): Promise<void> {
    if (!event.pspPaymentRef) return;
    const row = this.findPaymentForEvent(event, event.pspPaymentRef);
    if (!row || row.failedAt || row.settledAt) return;
    const failed: PaymentRecord = {
      ...row,
      status: "failed",
      failedAt: event.occurredAt,
      failureCategory: event.failureCategory ?? row.failureCategory ?? "other",
    };
    this.store.putPayment(failed);
    // Pay already announced a synchronous decline; only failedAt is new.
    if (row.status === "failed") return;
    await this.announcePaymentStatus(failed, await this.payeeOf(failed));
  }

  private async dispatchPspEvent(event: PspEvent): Promise<void> {
    switch (event.kind) {
      case "account.updated":
        return this.handleAccountUpdated(event);
      case "checkout.completed":
        return this.handleCheckoutCompleted(event);
      case "payment.succeeded":
        return this.handlePaymentSucceeded(event);
      case "payment.failed":
        return this.handlePaymentFailed(event);
      case "payout.paid":
      case "payout.failed":
      case "payout.canceled":
        // REQ-015 — producer payouts are owned by the payout workflow (WS1).
        return this.payoutEvents.onPayoutEvent(event);
      default:
        return;
    }
  }

  async receiveWebhook(rawBody: string, signature: string | undefined): Promise<void> {
    return this.tx.run(() => this.performReceiveWebhook(rawBody, signature));
  }

  private async performReceiveWebhook(rawBody: string, signature: string | undefined): Promise<void> {
    if (!signature) {
      throw new UnauthorizedException("Missing webhook signature");
    }
    const verified = this.pspEvents.verifyEvent(rawBody, signature);
    if (!verified.ok) {
      throw new BadRequestException("Invalid webhook signature");
    }
    // INT-326 / 04 §7 — dedupe on the PSP event id (prefix avoids NATS eventId clash).
    const eventId = verified.event.eventId.trim();
    if (!eventId) {
      throw new BadRequestException("Webhook missing event id");
    }
    const result = await this.consumer.handle(
      `psp:${eventId}`,
      verified.event,
      (event) => this.dispatchPspEvent(event),
    );
    if (result.status === "duplicate") {
      this.webhookDuplicateCount += 1;
      this.logger.warn(`PSP webhook duplicate ignored eventId=${eventId}`);
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
      return Boolean(account.pspPaymentMethodRef);
    }
    if (account.role === "prosumer") {
      return (
        account.kycStatus === "verified" && Boolean(account.pspPaymentMethodRef)
      );
    }
    return account.kycStatus === "verified";
  }

  private async emitAccountStatus(
    participantId: string,
    options?: { notFound?: "ignore" | "fail" },
  ): Promise<void> {
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
        paymentMethodPresent: Boolean(account.pspPaymentMethodRef),
      },
    });
    // INT-193 — sync notify AC-03 until NATS consumer is wired.
    // INT-228 — unknown fixture producers stay ignore; a member card must fail.
    await this.participants.applyPaymentAccountStatus({
      participantId,
      ready,
      reason: ready ? undefined : "payment_account",
      notFound: options?.notFound,
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
    if (account?.pspAccountRef) {
      try {
        await this.pspErase.erase({
          requestId: input.requestId,
          participantId: input.participantId,
          pspAccountRef: account.pspAccountRef,
        });
      } catch {
        result = "failed";
      }
    }
    if (account) {
      await this.saveAccount({
        ...account,
        pspPaymentMethodRef: null,
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
