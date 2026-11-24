import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ModuleAuthGuard,
  type AuthenticatedRequest,
} from "@intelligent/module-template";
import {
  KycQueryService,
  ManagerKycService,
} from "../kyc/manager-kyc.service.js";
import type { KycTestFixtureSubmission } from "../psp/kyc-test-fixture.port.js";
import { PaymentsService } from "./payments.service.js";

@Controller()
export class PaymentsController {
  constructor(
    @Inject(PaymentsService) private readonly payments: PaymentsService,
    @Inject(ManagerKycService) private readonly managerKyc: ManagerKycService,
    @Inject(KycQueryService) private readonly kycQuery: KycQueryService,
  ) {}

  @Get("v1/me/payment-account")
  @UseGuards(new ModuleAuthGuard({ roles: ["member"] }))
  async getMyPaymentAccount(@Req() req: AuthenticatedRequest) {
    const user = req.user!;
    return this.payments.getMyPaymentAccount(user.sub);
  }

  @Post("v1/me/payment-account/onboarding")
  @HttpCode(200)
  @UseGuards(new ModuleAuthGuard({ roles: ["member"] }))
  async onboarding(
    @Req() req: AuthenticatedRequest,
    @Body() body: { surface?: unknown; returnUrl?: unknown } | undefined,
  ) {
    const user = req.user!;
    const surface =
      body?.surface === "hosted" || body?.surface === "embedded"
        ? body.surface
        : undefined;
    return this.payments.startOnboarding({
      participantId: user.sub,
      communityId: user.communityId,
      role: roleOf(user.roles),
      surface,
      returnUrl: typeof body?.returnUrl === "string" ? body.returnUrl : undefined,
    });
  }

  @Post("v1/me/payment-account/onboarding/requirements")
  @HttpCode(200)
  @UseGuards(new ModuleAuthGuard({ roles: ["member"] }))
  async submitRequirements(
    @Req() req: AuthenticatedRequest,
    @Body() body: KycTestFixtureSubmission,
    @Headers("x-forwarded-for") forwardedFor: string | undefined,
  ) {
    const user = req.user!;
    const clientIp =
      forwardedFor?.split(",")[0]?.trim() ||
      (req as { ip?: string }).ip ||
      "127.0.0.1";
    return this.payments.submitOnboardingRequirements({
      participantId: user.sub,
      communityId: user.communityId,
      role: roleOf(user.roles),
      submission: body ?? {},
      clientIp,
    });
  }

  @Post("v1/me/payment-account/payment-method")
  @HttpCode(200)
  @UseGuards(new ModuleAuthGuard({ roles: ["member"] }))
  async attachPaymentMethod(
    @Req() req: AuthenticatedRequest,
    @Body() body: { paymentMethodId?: string },
  ) {
    const user = req.user!;
    if (!body?.paymentMethodId) {
      throw new BadRequestException("paymentMethodId is required");
    }
    return this.payments.attachCallerPaymentMethod({
      participantId: user.sub,
      communityId: user.communityId,
      role: roleOf(user.roles),
      paymentMethodId: body.paymentMethodId,
    });
  }

  @Post("v1/invoices/:invoiceId/payments")
  @HttpCode(201)
  @UseGuards(new ModuleAuthGuard({ roles: ["member"] }))
  async payInvoice(
    @Req() req: AuthenticatedRequest,
    @Param("invoiceId") invoiceId: string,
    @Body() body: { returnUrl?: unknown } | undefined,
  ) {
    const user = req.user!;
    // INT-193 — amount + producer PSP account from AC-06 GetInvoice.
    return this.payments.payInvoice({
      invoiceId,
      participantId: user.sub,
      communityId: user.communityId,
      returnUrl: typeof body?.returnUrl === "string" ? body.returnUrl : undefined,
    });
  }

  /**
   * REQ-051 / A5 — community managers verify via Stripe Identity (no Connect).
   */
  @Post("v1/me/identity-verification")
  @HttpCode(200)
  @UseGuards(new ModuleAuthGuard({ roles: ["manager"] }))
  async startIdentityVerification(
    @Req() req: AuthenticatedRequest,
    @Body() body: { returnUrl?: unknown } | undefined,
  ) {
    const user = req.user!;
    const returnUrl =
      typeof body?.returnUrl === "string" && body.returnUrl.length > 0
        ? body.returnUrl
        : "https://app.invalid/kyc-return";
    const started = await this.managerKyc.start(
      user.sub,
      user.communityId,
      returnUrl,
    );
    // OpenAPI IdentityVerificationSession uses Identity session statuses.
    return {
      verificationId: started.verificationId,
      url: started.url,
      status: "requires_input" as const,
    };
  }

  /** REQ-045 / REQ-051 — caller's KYC status (member or manager). */
  @Get("v1/me/kyc")
  @UseGuards(new ModuleAuthGuard({ roles: ["member", "manager"] }))
  async getMyKyc(@Req() req: AuthenticatedRequest) {
    return this.kycQuery.getStatus(req.user!.sub);
  }

  @Post("webhooks/payment-provider")
  @HttpCode(204)
  async webhook(
    @Req() req: AuthenticatedRequest & { body?: unknown; rawBody?: Buffer },
    @Headers("stripe-signature") signature: string | undefined,
  ) {
    const raw =
      req.rawBody?.toString("utf8") ??
      JSON.stringify(req.body ?? {});
    await this.payments.receiveWebhook(raw, signature);
  }
}

function roleOf(
  roles: string[],
): "consumer" | "producer" | "prosumer" {
  if (roles.includes("producer")) return "producer";
  if (roles.includes("prosumer")) return "prosumer";
  return "consumer";
}
