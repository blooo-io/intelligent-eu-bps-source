import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ModuleAuthGuard } from "@intelligent/module-template";
import { IntakeService } from "./intake.service.js";

/** Internal API — contracts/openapi/internal/trade-intake.v1.yaml */
@Controller("internal/v1")
@UseGuards(new ModuleAuthGuard({ roles: ["service", "operator"] }))
export class IntakeController {
  constructor(@Inject(IntakeService) private readonly intake: IntakeService) {}

  @Get("trades/unbilled")
  getUnbilledTrades(
    @Query("until") until: string,
    @Query("communityId") communityId?: string,
    @Query("consumerId") consumerId?: string,
    @Query("producerId") producerId?: string,
  ) {
    return this.intake.getUnbilledTrades({
      until,
      communityId,
      consumerId,
      producerId,
    });
  }

  @Post("intake\\:refresh")
  @HttpCode(202)
  async refreshIntake(@Body() body: { from: string; to: string }) {
    return this.intake.refreshIntake(body);
  }

  @Post("intake\\:check-health")
  @HttpCode(204)
  async checkIntakeHealth() {
    await this.intake.checkIntakeHealth();
  }
}
