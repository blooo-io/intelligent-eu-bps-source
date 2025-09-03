import { Controller, Get, Inject, Optional } from "@nestjs/common";
import { MODULE_NAME } from "../module-template.tokens.js";

export type HealthResponse = {
  status: "ok";
  module: string;
};

/** Liveness endpoint every module exposes for Kubernetes probes (TD-4). */
@Controller("health")
export class HealthController {
  // Optional inject keeps unit construction simple without a Nest testing module.
  constructor(
    @Optional() @Inject(MODULE_NAME) private readonly moduleName: string = "unknown",
  ) {}

  @Get()
  check(): HealthResponse {
    return { status: "ok", module: this.moduleName };
  }
}
