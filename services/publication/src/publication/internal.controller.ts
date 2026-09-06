import { Body, Controller, HttpCode, Inject, Post, UseGuards } from "@nestjs/common";
import { ModuleAuthGuard } from "@intelligent/module-template";
import { PublicationService } from "./publication.service.js";

/** Internal API — contracts/openapi/internal/publication.v1.yaml */
@Controller("internal/v1")
@UseGuards(new ModuleAuthGuard({ roles: ["service", "operator"] }))
export class InternalPublicationController {
  constructor(
    @Inject(PublicationService) private readonly publication: PublicationService,
  ) {}

  @Post(String.raw`publication\:retry-pending`)
  @HttpCode(202)
  async retryPending() {
    return this.publication.retryPending();
  }

  @Post(String.raw`publication\:purge-cache`)
  @HttpCode(202)
  async purgeCache(@Body() body: { before: string }) {
    return this.publication.purgeCache(body.before);
  }
}
