import {
  Controller,
  Get,
  Header,
  Inject,
  NotFoundException,
  Param,
  Query,
  Req,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import {
  ModuleAuthGuard,
  type AuthenticatedRequest,
} from "@intelligent/module-template";
import { ReportingService } from "./reporting.service.js";
import {
  PARTICIPANTS_RESOLVER,
  type ParticipantsResolverPort,
} from "../ports/participants-resolver.port.js";

/** Public API — contracts/openapi/public.v1.yaml Reports paths (AC-09). */
@Controller("v1")
export class PublicReportingController {
  constructor(
    @Inject(ReportingService) private readonly reporting: ReportingService,
    @Inject(PARTICIPANTS_RESOLVER)
    private readonly participants: ParticipantsResolverPort,
  ) {}

  @Get("communities/:communityId/payments-overview")
  @UseGuards(
    new ModuleAuthGuard({
      roles: ["manager", "operator"],
      // REQ-049 / UAT-060 — token community must be this community.
      requireCommunityScope: true,
    }),
  )
  paymentsOverview(@Param("communityId") communityId: string) {
    return this.reporting.getPaymentsOverview(communityId);
  }

  @Get("participants/:id/history")
  @UseGuards(
    new ModuleAuthGuard({ roles: ["member", "manager", "operator"] }),
  )
  async history(
    @Param("id") participantId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const user = req.user!;
    // REQ-049 — a member reads only their own registry participant (INT-373 via AC-03).
    const selfOnly =
      user.roles.includes("member") &&
      !user.roles.includes("manager") &&
      !user.roles.includes("operator");
    let selfParticipantId: string | undefined;
    if (selfOnly) {
      const bound = await this.participants.resolveByIdpSub(user.sub);
      if (!bound) {
        throw new NotFoundException(`Unknown participant ${participantId}`);
      }
      selfParticipantId = bound.participantId;
    }
    return this.reporting.getParticipantHistory(participantId, {
      communityId: user.communityId,
      selfParticipantId,
    });
  }

  @Get("reports/summary")
  @UseGuards(
    new ModuleAuthGuard({
      roles: ["manager", "operator"],
      // REQ-049 — communityId query must match the token community.
      requireCommunityScope: true,
    }),
  )
  summary(
    @Query("communityId") communityId: string,
    @Query("period") period: string,
  ) {
    return this.reporting.getPeriodicSummary(communityId, period);
  }

  @Get("kpi-exports/:period")
  @UseGuards(new ModuleAuthGuard({ roles: ["operator"] }))
  @Header("Content-Type", "application/octet-stream")
  kpiExport(
    @Param("period") period: string,
    @Query("communityId") communityId: string,
  ): StreamableFile {
    const file = this.reporting.getKpiExport(period, communityId);
    return new StreamableFile(file.body, {
      type: "application/octet-stream",
      disposition: `attachment; filename="${file.filename}"`,
    });
  }
}
