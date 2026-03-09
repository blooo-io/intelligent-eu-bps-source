import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { ModuleAuthGuard } from "@intelligent/module-template";
import type { PairSettlementInput } from "../domain/types.js";
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

  /**
   * INT-196 / UAT-028 — bridge AC-05 pair settlement → AC-06 invoice until
   * SettlementCompleted is consumed from the outbox/NATS path.
   */
  @Post("invoices\\:from-settlement")
  async createFromSettlement(
    @Body() body: PairSettlementInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    const invoice = await this.invoicing.createFromSettlement(body);
    if (!invoice) {
      res.status(200);
      return {
        skipped: true,
        settlementId: body.settlementId,
        reason: "zero_amount_carry_forward",
      };
    }
    res.status(201);
    return {
      invoiceId: invoice.invoiceId,
      producerId: invoice.producerId,
      consumerId: invoice.consumerId,
      currency: invoice.currency,
      status: invoice.status,
      total: invoice.total,
      tradeIds: invoice.tradeIds,
      pairSettlementId: invoice.settlementId,
      legalNumber: invoice.legalNumber ?? undefined,
      producerStripeAccountId: invoice.producerStripeAccountId,
      hostedInvoiceUrl: invoice.hostedInvoiceUrl ?? undefined,
    };
  }
}
