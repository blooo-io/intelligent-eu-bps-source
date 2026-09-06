import { Body, Controller, HttpCode, Inject, Post, UseGuards } from "@nestjs/common";
import { ModuleAuthGuard } from "@intelligent/module-template";
import type { DiscrepancyScope } from "../domain/types.js";
import { ReconciliationService } from "./reconciliation.service.js";

/** Internal API — contracts/openapi/internal/reconciliation.v1.yaml */
@Controller("internal/v1")
@UseGuards(new ModuleAuthGuard({ roles: ["service", "operator"] }))
export class InternalReconciliationController {
  constructor(
    @Inject(ReconciliationService)
    private readonly reconciliation: ReconciliationService,
  ) {}

  @Post(String.raw`reconciliation\:run`)
  @HttpCode(202)
  async reconcile(
    @Body() body: { scope: DiscrepancyScope; communityId?: string },
  ) {
    return this.reconciliation.reconcile(body);
  }
}
