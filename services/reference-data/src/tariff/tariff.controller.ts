import {
  Controller,
  Get,
  Inject,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ModuleAuthGuard } from "@intelligent/module-template";
import { TARIFF_PORT, type TariffPort } from "./tariff.port.js";

/**
 * REQ-004 — GetTariff for AC-05 (internal OpenAPI /communities/{id}/tariff).
 */
@Controller("internal/v1")
@UseGuards(new ModuleAuthGuard({ roles: ["service", "operator"] }))
export class TariffController {
  constructor(@Inject(TARIFF_PORT) private readonly tariffs: TariffPort) {}

  @Get("communities/:communityId/tariff")
  async getTariff(
    @Param("communityId") communityId: string,
    @Query("date") date: string,
  ) {
    const tariff = await this.tariffs.getTariff(communityId, date ?? "");
    return { communityId, date: date ?? "", tariff };
  }
}
