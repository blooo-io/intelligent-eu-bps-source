import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import { ModuleAuthGuard } from "@intelligent/module-template";
import { IntakeService } from "./intake.service.js";

/**
 * Public API — contracts/openapi/public.v1.yaml GET /intake/anomalies (AC-04 / REQ-029).
 * INT-218 — operator journey needs this edge; internal API alone is not enough.
 */
@Controller("v1")
export class PublicIntakeController {
  constructor(@Inject(IntakeService) private readonly intake: IntakeService) {}

  @Get("intake/anomalies")
  @UseGuards(new ModuleAuthGuard({ roles: ["operator"] }))
  listAnomalies(@Query("communityId") _communityId?: string) {
    void _communityId;
    return this.intake.listAnomalies();
  }
}
