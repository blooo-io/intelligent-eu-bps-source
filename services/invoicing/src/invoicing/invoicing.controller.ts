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

  /**
   * REQ-039 / UAT-050 — GetInvoiceDocument for AC-11 (and AC-07).
   */
  @Get("invoices/:invoiceId/document")
  getDocument(
    @Param("invoiceId") invoiceId: string,
    @Res() res: Response,
  ) {
    const { legalNumber, content } = this.invoicing.getDocument(invoiceId);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${legalNumber}.pdf"`,
    );
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Legal-Number", legalNumber);
    return res.status(200).send(content);
  }

  /**
   * REQ-013 / Task 3.19 — DSAR export: invoices where the participant is
   * issuer (producer) or addressee (consumer).
   */
  @Get("participants/:participantId/invoices")
  listParticipantInvoices(@Param("participantId") participantId: string) {
    return this.invoicing.listForParticipant(participantId);
  }

  /** INT-238 — poll invoice created by NATS SettlementCompleted (or bridge). */
  @Get(String.raw`invoices\:by-settlement/:settlementId`)
  getInvoiceBySettlement(@Param("settlementId") settlementId: string) {
    return this.invoicing.getInvoiceBySettlement(settlementId);
  }

  @Post(String.raw`invoices\:mark-overdue`)
  @HttpCode(202)
  async markOverdue(@Body() body: { asOf: string }) {
    return this.invoicing.markOverdue(body.asOf);
  }

  /** REQ-061 — AC-14 SendReminders batch. */
  @Post(String.raw`invoices\:send-reminders`)
  @HttpCode(202)
  async sendReminders(@Body() body: { asOf: string }) {
    return this.invoicing.sendDueReminders(body.asOf);
  }

  /**
   * INT-196 / UAT-028 — operator / seed bridge AC-05 → AC-06.
   * Primary path is SettlementCompleted NATS consumer (INT-223 / INT-238).
   */
  @Post(String.raw`invoices\:from-settlement`)
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
    };
  }
}
