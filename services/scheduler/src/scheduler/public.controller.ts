import {
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ModuleAuthGuard,
  type AuthenticatedRequest,
} from "@intelligent/module-template";
import { SchedulerService } from "./scheduler.service.js";

/** Public API — contracts/openapi/public.v1.yaml Operations /jobs (AC-14). */
@Controller("v1")
export class PublicSchedulerController {
  constructor(
    @Inject(SchedulerService) private readonly scheduler: SchedulerService,
  ) {}

  @Get("jobs")
  @UseGuards(new ModuleAuthGuard({ roles: ["operator"] }))
  list(@Query("communityId") communityId?: string) {
    return this.scheduler.listJobs(communityId);
  }

  @Post(String.raw`jobs/:id\:run`)
  @HttpCode(202)
  @UseGuards(new ModuleAuthGuard({ roles: ["operator", "manager"] }))
  async run(
    @Param("id") jobId: string,
    @Req() req: AuthenticatedRequest,
    @Query("period") period?: string,
  ) {
    return this.scheduler.runJob(jobId, {
      communityId: req.user?.communityId || undefined,
      period,
    });
  }
}
