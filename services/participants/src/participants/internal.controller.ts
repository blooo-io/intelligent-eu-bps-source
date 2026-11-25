import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ModuleAuthGuard } from "@intelligent/module-template";
import type { Request } from "express";
import { ActorSyncService } from "../actors/actor-sync.service.js";
import { ActorAuthorizationService } from "../authorization/actor-authorization.service.js";
import { ParticipantsService } from "./participants.service.js";

/** Internal API — contracts/openapi/internal/participants.v1.yaml */
@Controller("internal/v1")
@UseGuards(new ModuleAuthGuard({ roles: ["service", "operator"] }))
export class InternalParticipantsController {
  constructor(
    @Inject(ParticipantsService) private readonly participants: ParticipantsService,
    @Inject(ActorSyncService) private readonly actorSync: ActorSyncService,
    @Inject(ActorAuthorizationService)
    private readonly actorAuthz: ActorAuthorizationService,
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

  /** REQ-061 / Task 2.9 — AC-11 missing-payment alert inbox. */
  @Get("communities/:communityId/manager-contact")
  getManagerContact(@Param("communityId") communityId: string) {
    return this.participants.getManagerContact(communityId);
  }

  /** REQ-039 / Task 2.9 — AC-06 PDF issuer / addressee + self-billing mandate. */
  @Get("participants/:participantId/invoice-party")
  getInvoiceParty(@Param("participantId") participantId: string) {
    return this.participants.getInvoiceParty(participantId);
  }

  @Get("participants/:participantId/readiness")
  checkReadiness(@Param("participantId") participantId: string) {
    return this.participants.checkReadiness(participantId);
  }

  /** INT-336 — AC-12 binds a manager/DPO data-subject request to this community. */
  @Get("participants/:participantId/community")
  getParticipantCommunity(@Param("participantId") participantId: string) {
    return this.participants.getParticipantCommunity(participantId);
  }

  /**
   * REQ-013 / Task 3.18 — DSAR personal-data payload (service-role only).
   */
  @Get("participants/:participantId/personal-data")
  @UseGuards(new ModuleAuthGuard({ roles: ["service"] }))
  getPersonalData(@Param("participantId") participantId: string) {
    return this.participants.getPersonalData(participantId);
  }

  /**
   * REQ-013 / Task 3.18 — erase IdP identity (service-role only).
   * Keycloak 404 counts as erased.
   */
  @Post(String.raw`participants/:participantId\:erase-identity`)
  @HttpCode(200)
  @UseGuards(new ModuleAuthGuard({ roles: ["service"] }))
  eraseIdentity(@Param("participantId") participantId: string) {
    return this.participants.eraseIdentity(participantId);
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

  /**
   * REQ-008 — pull Actor records from ActorSourcePort and upsert participants.
   */
  @Post(String.raw`communities/:communityId/actors\:sync`)
  @HttpCode(200)
  syncActors(@Param("communityId") communityId: string) {
    return this.actorSync.sync(communityId);
  }

  /**
   * REQ-049 / REQ-052 — EWDS command authorizer lookup.
   * Unknown actors return 200 with status `unknown` (no id probing via 404).
   */
  @Get("actors/:actorId/authorization")
  getActorAuthorization(@Param("actorId") actorId: string) {
    return this.actorAuthz.authorize(actorId);
  }

  /**
   * REQ-010 / REQ-030 — bind a community manager (operator only).
   */
  @Put("communities/:communityId/managers/:actorId")
  @HttpCode(204)
  @UseGuards(new ModuleAuthGuard({ roles: ["operator"] }))
  async bindCommunityManager(
    @Param("communityId") communityId: string,
    @Param("actorId") actorId: string,
    @Req() req: Request,
  ): Promise<void> {
    const by =
      (req as Request & { user?: { sub?: string } }).user?.sub ?? "operator";
    await this.actorAuthz.bindManager(communityId, actorId, by);
  }
}
