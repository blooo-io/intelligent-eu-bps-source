import {
  BadRequestException,
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
import { PayoutsService } from "../payouts/payouts.service.js";
import { PaymentsService } from "./payments.service.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Controller("internal/v1")
@UseGuards(new ModuleAuthGuard({ roles: ["service", "operator"] }))
export class InternalPaymentsController {
  constructor(
    @Inject(PaymentsService) private readonly payments: PaymentsService,
    @Inject(PayoutsService) private readonly payouts: PayoutsService,
  ) {}

  @Get("payments/:paymentId")
  getPayment(@Param("paymentId") paymentId: string) {
    return this.payments.getPaymentStatus(paymentId);
  }

  @Get("payment-accounts/:participantId")
  getPaymentAccount(@Param("participantId") participantId: string) {
    return this.payments.getPaymentAccount(participantId);
  }

  /** AC-14 RunAutoPayouts (REQ-015). */
  @Post(String.raw`payouts\:run-auto`)
  @HttpCode(202)
  runAutoPayouts(@Body() body: { communityId?: unknown } | undefined) {
    const communityId = body?.communityId;
    if (typeof communityId !== "string" || !UUID.test(communityId)) {
      throw new BadRequestException("communityId must be a UUID");
    }
    return this.payouts.runAutoPayouts({ communityId });
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
