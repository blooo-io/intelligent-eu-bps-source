import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ModuleAuthGuard } from "@intelligent/module-template";
import { SettlementService } from "./settlement.service.js";
import { toPairSettlementBody } from "./pair-settlement.view.js";
import type { BillingRunType } from "../domain/types.js";

/** Internal API — contracts/openapi/internal/settlement.v1.yaml */
@Controller("internal/v1")
@UseGuards(new ModuleAuthGuard({ roles: ["service", "operator"] }))
export class SettlementController {
  constructor(
    @Inject(SettlementService) private readonly settlement: SettlementService,
  ) {}

  @Get("settlements/:settlementId")
  getPairSettlement(@Param("settlementId") settlementId: string) {
    const row = this.settlement.getPairSettlement(settlementId);
    const run = this.settlement.getBillingRun(row.runId);
    return toPairSettlementBody(row, run);
  }

  @Get("billing-runs/:runId")
  getBillingRun(@Param("runId") runId: string) {
    return this.settlement.getBillingRun(runId);
  }

  @Post("billing-runs")
  @HttpCode(202)
  async startRun(
    @Body()
    body: {
      communityId: string;
      type: BillingRunType;
      period?: string;
    },
  ) {
    return this.settlement.startRun(body);
  }

  /** INT-228 — operator seed: re-enable S1 fixture trades for a fresh Stripe run. */
  @Post(String.raw`fixture-billed\:reset`)
  @HttpCode(200)
  async resetFixtureBilled() {
    return this.settlement.resetFixtureBilled();
  }
}
