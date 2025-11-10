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
    return {
      settlementId: row.settlementId,
      runId: row.runId,
      consumerId: row.consumerId,
      producerId: row.producerId,
      tradeIds: row.tradeIds,
      kWh: row.kWh,
      energyAmount: row.energyAmount,
      vat: row.vat,
      currency: row.currency,
      rate: row.rate,
      carriedForwardIn: row.carriedForwardIn,
      carriedForwardOut: row.carriedForwardOut,
    };
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
}
