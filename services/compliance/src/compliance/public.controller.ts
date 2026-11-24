import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
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

  /**
   * REQ-013 Art. 15/20 — download the machine-readable DSAR export (Task 3.20).
   * Assembled on each GET; Content-Disposition attachment.
   */
  @Get("data-subject-requests/:id/export")
  @Header("Cache-Control", "private, no-store")
  @UseGuards(new ModuleAuthGuard({ roles: ["member", "dpo", "manager", "operator"] }))
  async export(
    @Param("id") id: string,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const user = req.user!;
    const memberOnly =
      user.roles.includes("member") &&
      !user.roles.includes("manager") &&
      !user.roles.includes("dpo") &&
      !user.roles.includes("operator");
    const selfParticipantId = memberOnly
      ? await this.memberParticipantId(user.sub, user.communityId)
      : undefined;
    const payload = await this.compliance.getExportForCaller(id, {
      sub: user.sub,
      communityId: user.communityId,
      roles: user.roles,
      selfParticipantId,
    });
    const body = Buffer.from(JSON.stringify(payload, null, 2), "utf8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="dsar-${id}.json"`,
    );
    return new StreamableFile(body, {
      type: "application/json",
      disposition: `attachment; filename="dsar-${id}.json"`,
    });
  }
}
