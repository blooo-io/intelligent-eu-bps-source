import { Controller, Get, HttpCode, Inject, Post, UseGuards } from "@nestjs/common";
import { ModuleAuthGuard } from "@intelligent/module-template";
import { ComplianceService } from "./compliance.service.js";

/** Internal API — contracts/openapi/internal/compliance.v1.yaml */
@Controller("internal/v1")
@UseGuards(new ModuleAuthGuard({ roles: ["service", "operator"] }))
export class InternalComplianceController {
  constructor(
    @Inject(ComplianceService) private readonly compliance: ComplianceService,
  ) {}

  @Post(String.raw`retention\:apply`)
  @HttpCode(202)
  async applyRetention() {
    return this.compliance.applyRetention();
  }

  /** REQ-011 / Task 3.23 — explicit retention periods for peers and operators. */
  @Get("retention-policy")
  getRetentionPolicy() {
    return this.compliance.getRetentionPolicy();
  }
}
