import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ModuleAuthGuard } from "@intelligent/module-template";
import { PaymentsService } from "./payments.service.js";

@Controller("internal/v1")
@UseGuards(new ModuleAuthGuard({ roles: ["service", "operator"] }))
export class InternalPaymentsController {
  constructor(
    @Inject(PaymentsService) private readonly payments: PaymentsService,
  ) {}

  @Get("payments/:paymentId")
  getPayment(@Param("paymentId") paymentId: string) {
    return this.payments.getPaymentStatus(paymentId);
  }

  @Get("payment-accounts/:participantId")
  getPaymentAccount(@Param("participantId") participantId: string) {
    return this.payments.getPaymentAccount(participantId);
  }

  @Post(String.raw`connected-customers\:ensure`)
  @HttpCode(200)
  ensureConnectedCustomer(
    @Body() body: { participantId: string; pspAccountRef: string },
  ) {
    return this.payments.ensureConnectedCustomer({
      participantId: body?.participantId,
      pspAccountRef: body?.pspAccountRef,
    });
  }

  @Post(String.raw`payment-accounts\:provision`)
  @HttpCode(201)
  provision(
    @Body()
    body: {
      participantId: string;
      communityId: string;
      role: "producer" | "consumer" | "prosumer";
      fresh?: boolean;
    },
  ) {
    return this.payments.provisionPaymentAccount({
      participantId: body.participantId,
      communityId: body.communityId,
      role: body.role,
      fresh: body.fresh,
    });
  }
}
