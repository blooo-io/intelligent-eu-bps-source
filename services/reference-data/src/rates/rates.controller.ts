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
import { RatesService } from "./rates.service.js";

/** Internal API paths under /internal/v1 (OpenAPI servers.url). */
@Controller("internal/v1")
@UseGuards(new ModuleAuthGuard({ roles: ["service", "operator"] }))
export class RatesController {
  // Explicit @Inject — Vitest/esbuild does not emit design:paramtypes for Nest DI.
  constructor(@Inject(RatesService) private readonly rates: RatesService) {}

  @Get("rates")
  getRate(
    @Query("currency") currency: string,
    @Query("date") date: string,
  ) {
    return this.rates.getRate(currency, date);
  }

  @Post("rates:fetch")
  @HttpCode(202)
  fetchRates(@Body() body: { date: string }) {
    return this.rates.fetchRates(body.date);
  }
}
