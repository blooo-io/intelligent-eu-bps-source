import { Inject, Injectable, OnModuleInit } from "@nestjs/common";
import { ComplianceService } from "../compliance/compliance.service.js";
import {
  ERASURE_REQUEST_PORT,
  type ErasureRequestPort,
} from "./erasure-request.port.js";

/**
 * Wires the EWDS erasure-request port to {@link ComplianceService.acceptExternalErasureRequest}
 * at module boot (REQ-013 / Task 3.22).
 */
@Injectable()
export class ErasureRequestListener implements OnModuleInit {
  constructor(
    @Inject(ERASURE_REQUEST_PORT) private readonly port: ErasureRequestPort,
    @Inject(ComplianceService) private readonly compliance: ComplianceService,
  ) {}

  onModuleInit(): void {
    this.port.onRequest(async (request) => {
      await this.compliance.acceptExternalErasureRequest(request);
    });
  }
}
