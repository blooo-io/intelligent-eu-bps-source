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

  @Post("parties\\:resolve")
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
}
