import {
  Controller,
  Get,
  Header,
  Inject,
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

/** Public API — contracts/openapi/public.v1.yaml Reports paths (AC-09). */
@Controller("v1")
export class PublicReportingController {
  constructor(
    @Inject(ReportingService) private readonly reporting: ReportingService,
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
  history(
    @Param("id") participantId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const user = req.user!;
    // REQ-049 — a member reads only their own participant id.
    const selfOnly =
      user.roles.includes("member") &&
      !user.roles.includes("manager") &&
      !user.roles.includes("operator");
    return this.reporting.getParticipantHistory(participantId, {
      communityId: user.communityId,
      selfParticipantId: selfOnly ? user.sub : undefined,
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
