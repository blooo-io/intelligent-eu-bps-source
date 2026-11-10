import {
  BadRequestException,
  Body,
  Controller,
  Get,
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
import type { DataSubjectRequestType } from "../domain/types.js";
import { ComplianceService } from "./compliance.service.js";

/** Public API — contracts/openapi/public.v1.yaml Privacy paths (AC-12). */
@Controller("v1")
export class PublicComplianceController {
  constructor(
    @Inject(ComplianceService) private readonly compliance: ComplianceService,
  ) {}

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
      : user.sub;
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
  get(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    const user = req.user!;
    // REQ-049 — hide a request the caller does not own or whose community differs.
    return this.compliance.getRequestForCaller(id, {
      sub: user.sub,
      communityId: user.communityId,
      roles: user.roles,
    });
  }
}
