import { Controller, Get, Inject, Param, UseGuards } from "@nestjs/common";
import { ModuleAuthGuard } from "@intelligent/module-template";
import { VatService } from "./vat.service.js";

@Controller("internal/v1")
@UseGuards(new ModuleAuthGuard({ roles: ["service", "operator"] }))
export class VatController {
  constructor(@Inject(VatService) private readonly vat: VatService) {}

  @Get("communities/:communityId/vat-rate")
  getVatRate(@Param("communityId") communityId: string) {
    return this.vat.getVatRate(communityId);
  }
}
