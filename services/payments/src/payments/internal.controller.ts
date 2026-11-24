import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ModuleAuthGuard } from "@intelligent/module-template";
import { KycQueryService } from "../kyc/manager-kyc.service.js";
import { PayoutsService } from "../payouts/payouts.service.js";
import { PaymentsService } from "./payments.service.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Controller("internal/v1")
@UseGuards(new ModuleAuthGuard({ roles: ["service", "operator"] }))
export class InternalPaymentsController {
  constructor(
    @Inject(PaymentsService) private readonly payments: PaymentsService,
    @Inject(PayoutsService) private readonly payouts: PayoutsService,
    @Inject(KycQueryService) private readonly kycQuery: KycQueryService,
  ) {}

  /**
   * REQ-045 / REQ-051 — KYC status for a subject (participant or manager).
   * Used by AC-03 and the shared RequireVerifiedKycGuard (Task 3.8).
   */
  @Get("kyc-status/:subjectId")
  @UseGuards(new ModuleAuthGuard({ roles: ["service"] }))
  getKycStatus(@Param("subjectId") subjectId: string) {
    return this.kycQuery.getStatus(subjectId);
  }

  /**
   * REQ-043 / UAT-054 — whether live Stripe keys are configured (AC-03 live guard).
   */
  @Get("psp/capabilities")
  @UseGuards(new ModuleAuthGuard({ roles: ["service", "operator"] }))
  getPspCapabilities() {
    return this.payments.pspCapabilities();
  }

  @Get("payments/:paymentId")
  getPayment(@Param("paymentId") paymentId: string) {
    return this.payments.getPaymentStatus(paymentId);
  }

  @Get("payment-accounts/:participantId")
  getPaymentAccount(@Param("participantId") participantId: string) {
    return this.payments.getPaymentAccount(participantId);
  }

  /**
   * REQ-013 / Task 3.18 — payment-account personal data for DSAR (service only).
   */
  @Get("payment-accounts/:participantId/personal-data")
  @UseGuards(new ModuleAuthGuard({ roles: ["service"] }))
  getPersonalData(@Param("participantId") participantId: string) {
    return this.payments.getPersonalData(participantId);
  }

  /**
   * REQ-013 / Task 3.18 — erase at PSP (service only).
   * Optional `livemode=true` retains the Connect account under AML.
   */
  @Post(String.raw`payment-accounts/:participantId\:erase-at-psp`)
  @HttpCode(200)
  @UseGuards(new ModuleAuthGuard({ roles: ["service"] }))
  eraseAtPsp(
    @Param("participantId") participantId: string,
    @Query("livemode") livemode?: string,
    @Body() body?: { livemode?: boolean },
  ) {
    const live =
      body?.livemode === true ||
      livemode === "true" ||
      livemode === "1";
    return this.payments.eraseAtPsp(participantId, { livemode: live });
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
