import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ModuleAuthGuard,
  type AuthenticatedRequest,
} from "@intelligent/module-template";
import type { DataSubjectRequestType } from "../domain/types.js";
import {
  PARTICIPANT_COMMUNITY,
  type ParticipantCommunityPort,
} from "../ports/participant-community.port.js";
import { ComplianceService } from "./compliance.service.js";

/** Public API — contracts/openapi/public.v1.yaml Privacy paths (AC-12). */
@Controller("v1")
export class PublicComplianceController {
  constructor(
    @Inject(ComplianceService) private readonly compliance: ComplianceService,
    @Inject(PARTICIPANT_COMMUNITY)
    private readonly directory: ParticipantCommunityPort,
  ) {}

  /**
   * REQ-013 / INT-375 — the token `sub` is the IdP subject, not the registry
   * participant. A member's own request is stored and read under the AC-03 id.
   */
  private async memberParticipantId(sub: string, communityId: string): Promise<string> {
    const bound = await this.directory.resolveByIdpSub(sub);
    if (!bound || (communityId && bound.communityId !== communityId)) {
      throw new NotFoundException("Unknown participant");
    }
    return bound.participantId;
  }

  @Post("data-subject-requests")
  @HttpCode(201)
  @UseGuards(new ModuleAuthGuard({ roles: ["member", "dpo", "manager"] }))
  async create(
    @Req() req: AuthenticatedRequest,
    @Body() body: { type: DataSubjectRequestType; participantId?: string },
  ) {
    const user = req.user!;
    // REQ-013 — manager and DPO may name another participant. A member may not.
    const elevated =
      user.roles.includes("manager") || user.roles.includes("dpo");
    const participantId = elevated
      ? body.participantId?.trim() || user.sub
      : await this.memberParticipantId(user.sub, user.communityId);
    if (!participantId) {
      throw new BadRequestException("participantId is required");
    }
    if (elevated && participantId !== user.sub) {
      await this.compliance.assertParticipantInCommunity(
        participantId,
        user.communityId,
      );
    }
    return this.compliance.createDataSubjectRequest({
      type: body.type,
      participantId,
      actorId: user.sub,
      communityId: user.communityId,
    });
  }

  @Get("data-subject-requests/:id")
  @UseGuards(new ModuleAuthGuard({ roles: ["member", "dpo", "manager", "operator"] }))
  async get(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    const user = req.user!;
    // REQ-049 — hide a request the caller does not own or whose community differs.
    const memberOnly =
      user.roles.includes("member") &&
      !user.roles.includes("manager") &&
      !user.roles.includes("dpo") &&
      !user.roles.includes("operator");
    const selfParticipantId = memberOnly
      ? await this.memberParticipantId(user.sub, user.communityId)
      : undefined;
    return this.compliance.getRequestForCaller(id, {
      sub: user.sub,
      communityId: user.communityId,
      roles: user.roles,
      selfParticipantId,
    });
  }
}
