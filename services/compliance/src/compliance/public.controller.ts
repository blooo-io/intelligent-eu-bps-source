import {
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
    // Member acts for self; DPO/manager may target another participant (REQ-013).
    const participantId =
      body.participantId ??
      (user.roles.includes("member") ? user.sub : undefined);
    return this.compliance.createDataSubjectRequest({
      type: body.type,
      participantId: participantId ?? "",
      actorId: user.sub,
      communityId: user.communityId,
    });
  }

  @Get("data-subject-requests/:id")
  @UseGuards(new ModuleAuthGuard({ roles: ["member", "dpo", "manager", "operator"] }))
  get(@Param("id") id: string) {
    return this.compliance.getRequest(id);
  }
}
