import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import { ModuleAuthGuard } from "@intelligent/module-template";
import { ReconciliationService } from "./reconciliation.service.js";

/** Public API — contracts/openapi/public.v1.yaml GET /reconciliation/discrepancies */
@Controller("v1")
export class PublicReconciliationController {
  constructor(
    @Inject(ReconciliationService)
    private readonly reconciliation: ReconciliationService,
  ) {}

  @Get("reconciliation/discrepancies")
  @UseGuards(new ModuleAuthGuard({ roles: ["operator"] }))
  listDiscrepancies(@Query("communityId") communityId?: string) {
    return this.reconciliation.listDiscrepancies(communityId);
  }
}
