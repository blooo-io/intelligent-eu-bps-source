import {
  Body,
  Controller,
  HttpCode,
  Inject,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ModuleAuthGuard } from "@intelligent/module-template";
import { ReportingService } from "./reporting.service.js";

/** Internal API — contracts/openapi/internal/reporting.v1.yaml */
@Controller("internal/v1")
@UseGuards(new ModuleAuthGuard({ roles: ["service", "operator"] }))
export class InternalReportingController {
  constructor(
    @Inject(ReportingService) private readonly reporting: ReportingService,
  ) {}

  @Post("reports\\:build")
  @HttpCode(202)
  async buildReport(
    @Body() body: { communityId: string; period: string },
  ) {
    return this.reporting.buildReport(body);
  }

  @Post("kpi-exports")
  @HttpCode(202)
  async exportKpi(@Body() body: { communityId: string; period: string }) {
    return this.reporting.exportKpi(body);
  }
}
