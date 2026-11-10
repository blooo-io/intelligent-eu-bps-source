import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ModuleAuthGuard,
  type AuthenticatedRequest,
} from "@intelligent/module-template";
import { SettlementService } from "./settlement.service.js";
import type { BillingRunType } from "../domain/types.js";

/**
 * Public API — balances, early settle, billing runs (INT-211 / REQ-057 / REQ-006).
 * contracts/openapi/public.v1.yaml · x-served-by AC-05.
 */
@Controller("v1")
export class PublicSettlementController {
  constructor(
    @Inject(SettlementService) private readonly settlement: SettlementService,
  ) {}

  @Get("me/balances")
  @UseGuards(new ModuleAuthGuard({ roles: ["member"] }))
  async listMyBalances(@Req() req: AuthenticatedRequest) {
    return this.settlement.listBalancesForParticipant(
      req.user!.sub,
      req.user!.communityId,
    );
  }

  @Post("early-settlements")
  @HttpCode(201)
  @UseGuards(new ModuleAuthGuard({ roles: ["member"] }))
  async createEarlySettlement(
    @Req() req: AuthenticatedRequest,
    @Body() body: { producerId: string },
  ) {
    // BR-05 — threshold does not apply for early settle.
    return this.settlement.createEarlySettlement({
      consumerId: req.user!.sub,
      producerId: body.producerId,
      communityId: req.user!.communityId,
    });
  }

  @Post("communities/:communityId/billing-runs")
  @HttpCode(202)
  @UseGuards(
    new ModuleAuthGuard({
      roles: ["manager", "operator"],
      // REQ-049 / UAT-060 — token community must be this community.
      requireCommunityScope: true,
    }),
  )
  async startCommunityRun(
    @Param("communityId") communityId: string,
    @Body() body: { type: BillingRunType; period?: string },
  ) {
    return this.settlement.startPublicRun({
      communityId,
      type: body.type,
      period: body.period,
    });
  }

  @Get("billing-runs/:id")
  @UseGuards(new ModuleAuthGuard({ roles: ["member", "manager", "operator"] }))
  getBillingRun(@Param("id") runId: string, @Req() req: AuthenticatedRequest) {
    // REQ-049 — 404 when the run is outside the caller's community.
    return this.settlement.getPublicBillingRun(runId, req.user!.communityId);
  }
}
