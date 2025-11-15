import {
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
    const role = (user.roles.includes("producer")
      ? "producer"
      : user.roles.includes("prosumer")
        ? "prosumer"
        : "consumer") as "consumer" | "producer" | "prosumer";
    return this.payments.startOnboarding({
      participantId: user.sub,
      communityId: user.communityId,
      role,
      returnUrl: "https://app.intelligent-eu-bp.blooo.dev/me",
    });
  }

  @Post("v1/invoices/:invoiceId/payments")
  @HttpCode(201)
  @UseGuards(new ModuleAuthGuard({ roles: ["member"] }))
  async payInvoice(
    @Req() req: AuthenticatedRequest,
    @Param("invoiceId") invoiceId: string,
  ) {
    const user = req.user!;
    // V1 fixture amounts until AC-06 GetInvoice HTTP client is wired.
    return this.payments.payInvoice({
      invoiceId,
      participantId: user.sub,
      communityId: user.communityId,
      amount: "2.00",
      currency: "EUR",
      producerStripeAccountId: "acct_test_producer",
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
