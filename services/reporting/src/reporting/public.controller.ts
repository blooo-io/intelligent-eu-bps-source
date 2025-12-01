import {
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Query,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import { ModuleAuthGuard } from "@intelligent/module-template";
import { ReportingService } from "./reporting.service.js";

/** Public API — contracts/openapi/public.v1.yaml Reports paths (AC-09). */
@Controller("v1")
export class PublicReportingController {
  constructor(
    @Inject(ReportingService) private readonly reporting: ReportingService,
  ) {}

  @Get("communities/:id/payments-overview")
  @UseGuards(new ModuleAuthGuard({ roles: ["manager", "operator"] }))
  paymentsOverview(@Param("id") communityId: string) {
    return this.reporting.getPaymentsOverview(communityId);
  }

  @Get("participants/:id/history")
  @UseGuards(
    new ModuleAuthGuard({ roles: ["member", "manager", "operator"] }),
  )
  history(@Param("id") participantId: string) {
    return this.reporting.getParticipantHistory(participantId);
  }

  @Get("reports/summary")
  @UseGuards(new ModuleAuthGuard({ roles: ["manager", "operator"] }))
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
