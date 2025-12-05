import {
  Body,
  Controller,
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
import type { InvoiceStatus } from "../domain/types.js";
import { InvoicingService } from "./invoicing.service.js";

/** Public API — POST /v1/invoices/{id}/status (REQ-044 / UAT-055). */
@Controller("v1")
export class PublicInvoicingController {
  constructor(
    @Inject(InvoicingService) private readonly invoicing: InvoicingService,
  ) {}

  @Post("invoices/:id/status")
  @HttpCode(200)
  @UseGuards(new ModuleAuthGuard({ roles: ["manager"] }))
  async setStatus(
    @Param("id") invoiceId: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: { status: InvoiceStatus; reason: string },
  ) {
    return this.invoicing.setInvoiceStatus(invoiceId, {
      status: body.status,
      reason: body.reason,
      actorId: req.user!.sub,
    });
  }
}
