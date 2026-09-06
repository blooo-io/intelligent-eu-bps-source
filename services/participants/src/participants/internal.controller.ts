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
import { ParticipantsService } from "./participants.service.js";

/** Internal API — contracts/openapi/internal/participants.v1.yaml */
@Controller("internal/v1")
@UseGuards(new ModuleAuthGuard({ roles: ["service", "operator"] }))
export class InternalParticipantsController {
  constructor(
    @Inject(ParticipantsService) private readonly participants: ParticipantsService,
  ) {}

  @Post(String.raw`parties\:resolve`)
  @HttpCode(200)
  resolveParty(@Body() body: { marketId: string }) {
    return this.participants.resolveParty(body.marketId);
  }

  @Get("communities/:communityId/settings")
  getCommunitySettings(@Param("communityId") communityId: string) {
    return this.participants.getCommunitySettings(communityId);
  }

  @Get("participants/:participantId/readiness")
  checkReadiness(@Param("participantId") participantId: string) {
    return this.participants.checkReadiness(participantId);
  }

  /** INT-274 — AC-11 payment-notice recipient from profile e-mail. */
  @Get("participants/:participantId/notification-contact")
  getNotificationContact(@Param("participantId") participantId: string) {
    return this.participants.getNotificationContact(participantId);
  }

  /** INT-230 — IdP sub → participantId for AC-07 pay / onboarding. */
  @Get(String.raw`participants\:by-idp-sub/:idpUserId`)
  resolveByIdpSub(@Param("idpUserId") idpUserId: string) {
    return this.participants.resolveByIdpSub(idpUserId);
  }

  /** INT-193 — AC-07 notifies KYC / payment-method readiness (sync until NATS). */
  @Post("participants/:participantId/payment-account-status")
  @HttpCode(200)
  applyPaymentAccountStatus(
    @Param("participantId") participantId: string,
    @Body() body: { ready: boolean; reason?: string },
  ) {
    return this.participants.applyPaymentAccountStatus({
      participantId,
      ready: body.ready,
      reason: body.reason,
    });
  }
}
