import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ModuleAuthGuard } from "@intelligent/module-template";
import { InvoicingService } from "./invoicing.service.js";

@Controller("internal/v1")
@UseGuards(new ModuleAuthGuard({ roles: ["service", "operator"] }))
export class InvoicingController {
  constructor(
    @Inject(InvoicingService) private readonly invoicing: InvoicingService,
  ) {}

  @Get("invoices/:invoiceId")
  getInvoice(@Param("invoiceId") invoiceId: string) {
    return this.invoicing.getInvoice(invoiceId);
  }

  @Post("invoices\\:mark-overdue")
  @HttpCode(202)
  async markOverdue(@Body() body: { asOf: string }) {
    return this.invoicing.markOverdue(body.asOf);
  }
}
