import {
  Controller,
  Headers,
  HttpCode,
  Inject,
  Post,
  Req,
} from "@nestjs/common";
import { type AuthenticatedRequest } from "@intelligent/module-template";
import { PaymentsService } from "./payments.service.js";

@Controller()
export class PaymentsController {
  constructor(
    @Inject(PaymentsService) private readonly payments: PaymentsService,
  ) {}

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