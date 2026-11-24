import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ModuleAuthGuard, type AuthenticatedRequest } from "@intelligent/module-template";
import type { PayoutRecord } from "../domain/payouts.store.js";
import { PayoutsService } from "./payouts.service.js";

/** Contract `BillingPeriod`: YYYY-MM or YYYY-Qn (REQ-006). */
const BILLING_PERIOD = /^\d{4}-(0[1-9]|1[0-2]|Q[1-4])$/;

/** Contract `Payout` (public.v1) has additionalProperties: false — no PSP refs or attempts. */
function toPayout(row: PayoutRecord) {
  return {
    payoutId: row.payoutId,
    participantId: row.participantId,
    period: row.period,
    amount: row.amount,
    currency: row.currency,
    status: row.status,
    trigger: row.trigger,
    requestedAt: row.requestedAt,
    ...(row.arrivalDate ? { arrivalDate: row.arrivalDate } : {}),
    ...(row.failureCategory ? { failureCategory: row.failureCategory } : {}),
  };
}

/** REQ-015 / REQ-060 — the caller's own payouts and withdrawals (REQ-010). */
@Controller("v1/me/payouts")
@UseGuards(new ModuleAuthGuard({ roles: ["member"] }))
export class PayoutsController {
  constructor(@Inject(PayoutsService) private readonly payouts: PayoutsService) {}

  @Get()
  async list(@Req() req: AuthenticatedRequest) {
    const { items, withdrawable } = await this.payouts.listForParticipant(req.user!.sub);
    return { items: items.map(toPayout), withdrawable };
  }

  @Post()
  @HttpCode(201)
  async request(@Req() req: AuthenticatedRequest, @Body() body: { period?: unknown } | undefined) {
    const period = body?.period;
    if (typeof period !== "string" || !BILLING_PERIOD.test(period)) {
      throw new BadRequestException("period must be YYYY-MM or YYYY-Qn");
    }
    const user = req.user!;
    const row = await this.payouts.requestWithdrawal({
      participantId: user.sub,
      communityId: user.communityId,
      period,
      trigger: "participant",
    });
    return toPayout(row);
  }
}
