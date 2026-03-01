import {
  BadRequestException,
  Body,
  Controller,
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
import type { OnboardingRequirementsSubmission } from "../psp/psp.port.js";
import { PaymentsService } from "./payments.service.js";

@Controller()
export class PaymentsController {
  constructor(
    @Inject(PaymentsService) private readonly payments: PaymentsService,
  ) {}

  @Post("v1/me/payment-account/onboarding")
  @HttpCode(200)
  @UseGuards(new ModuleAuthGuard({ roles: ["member"] }))
  async onboarding(@Req() req: AuthenticatedRequest) {
    const user = req.user!;
    return this.payments.startOnboarding({
      participantId: user.sub,
      communityId: user.communityId,
      role: roleOf(user.roles),
    });
  }

  @Post("v1/me/payment-account/onboarding/requirements")
  @HttpCode(200)
  @UseGuards(new ModuleAuthGuard({ roles: ["member"] }))
  async submitRequirements(
    @Req() req: AuthenticatedRequest,
    @Body() body: OnboardingRequirementsSubmission,
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
    this.payments.ensureParticipant({
      participantId: user.sub,
      communityId: user.communityId,
      role: roleOf(user.roles),
    });
    return this.payments.attachPaymentMethod(user.sub, body.paymentMethodId);
  }

  @Post("v1/invoices/:invoiceId/payments")
  @HttpCode(201)
  @UseGuards(new ModuleAuthGuard({ roles: ["member"] }))
  async payInvoice(
    @Req() req: AuthenticatedRequest,
    @Param("invoiceId") invoiceId: string,
  ) {
    const user = req.user!;
    // INT-193 — amount + producer Connect id from AC-06 GetInvoice.
    return this.payments.payInvoice({
      invoiceId,
      participantId: user.sub,
      communityId: user.communityId,
    });
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
