import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ModuleAuthGuard,
  type AuthenticatedRequest,
} from "@intelligent/module-template";
import type {
  BillingProfile,
  CommunitySettings,
  ParticipantImportRow,
  ParticipantPatch,
} from "../domain/types.js";
import { ParticipantsService } from "./participants.service.js";

/** Public API paths served by AC-03 (contracts/openapi/public.v1.yaml). */
@Controller("v1")
export class PublicParticipantsController {
  constructor(
    @Inject(ParticipantsService) private readonly participants: ParticipantsService,
  ) {}

  @Get("me")
  @UseGuards(new ModuleAuthGuard({ roles: ["member", "manager", "operator"] }))
  getMe(@Req() req: AuthenticatedRequest) {
    const user = req.user!;
    return this.participants.getMe(user.sub, user.roles);
  }

  @Put("me/profile")
  @UseGuards(new ModuleAuthGuard({ roles: ["member"] }))
  async putMyProfile(
    @Req() req: AuthenticatedRequest,
    @Body() body: BillingProfile,
  ) {
    return this.participants.updateProfile(req.user!.sub, body);
  }

  @Get("terms/current")
  @UseGuards(new ModuleAuthGuard({ roles: ["member", "manager", "operator"] }))
  getCurrentTerms() {
    return this.participants.getCurrentTerms();
  }

  @Post("me/terms-acceptance")
  @HttpCode(201)
  @UseGuards(new ModuleAuthGuard({ roles: ["member"] }))
  async acceptTerms(
    @Req() req: AuthenticatedRequest,
    @Body() body: { termsVersion: string; selfBillingMandate: boolean },
  ) {
    return this.participants.acceptTerms(req.user!.sub, body);
  }

  @Get("communities/:communityId/settings")
  @UseGuards(
    new ModuleAuthGuard({
      roles: ["manager", "operator", "service"],
      requireCommunityScope: true,
    }),
  )
  getCommunitySettings(@Param("communityId") communityId: string) {
    return this.participants.getCommunitySettings(communityId);
  }

  @Put("communities/:communityId/settings")
  @UseGuards(
    new ModuleAuthGuard({
      roles: ["manager"],
      requireCommunityScope: true,
    }),
  )
  putCommunitySettings(
    @Param("communityId") communityId: string,
    @Body() body: Omit<CommunitySettings, "communityId">,
  ) {
    return this.participants.updateCommunitySettings(communityId, body);
  }

  @Post(String.raw`communities/:communityId/participants\:import`)
  @HttpCode(201)
  @UseGuards(
    new ModuleAuthGuard({
      roles: ["manager"],
      requireCommunityScope: true,
    }),
  )
  async importParticipants(
    @Param("communityId") communityId: string,
    @Body() body: { participants: ParticipantImportRow[] },
  ) {
    return this.participants.importParticipants(communityId, body.participants);
  }

  @Get("communities/:communityId/participants")
  @UseGuards(
    new ModuleAuthGuard({
      roles: ["manager", "operator"],
      requireCommunityScope: true,
    }),
  )
  listParticipants(@Param("communityId") communityId: string) {
    return this.participants.listParticipants(communityId);
  }

  @Patch("participants/:participantId")
  @UseGuards(new ModuleAuthGuard({ roles: ["manager"] }))
  patchParticipant(
    @Req() req: AuthenticatedRequest,
    @Param("participantId") participantId: string,
    @Body() body: ParticipantPatch,
  ) {
    this.assertManagerOwnsParticipant(req, participantId);
    return this.participants.patchParticipant(participantId, body);
  }

  // OpenAPI custom method `/participants/{id}:offboard` — escape `:` for path-to-regexp.
  @Post(String.raw`participants/:participantId\:offboard`)
  @HttpCode(202)
  @UseGuards(new ModuleAuthGuard({ roles: ["manager"] }))
  async offboardParticipant(
    @Req() req: AuthenticatedRequest,
    @Param("participantId") participantId: string,
  ) {
    this.assertManagerOwnsParticipant(req, participantId);
    return this.participants.offboardParticipant(participantId);
  }

  /** REQ-010 — manager may only mutate participants in their community. */
  private assertManagerOwnsParticipant(
    req: AuthenticatedRequest,
    participantId: string,
  ): void {
    const listed = this.participants.listParticipants(req.user!.communityId);
    if (!listed.some((p) => p.participantId === participantId)) {
      throw new NotFoundException(`Unknown participant ${participantId}`);
    }
  }
}
