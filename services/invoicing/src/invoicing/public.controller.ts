import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import {
  ModuleAuthGuard,
  type AuthenticatedRequest,
} from "@intelligent/module-template";
import type { InvoiceStatus } from "../domain/types.js";
import { InvoicingService } from "./invoicing.service.js";

/**
 * Public API — list/get/document invoices + manager status (INT-193 / REQ-007,
 * REQ-039, REQ-044 / UAT-055).
 */
@Controller("v1")
export class PublicInvoicingController {
  constructor(
    @Inject(InvoicingService) private readonly invoicing: InvoicingService,
  ) {}

  @Get("me/invoices")
  @UseGuards(new ModuleAuthGuard({ roles: ["member"] }))
  async listMine(@Req() req: AuthenticatedRequest) {
    // INT-236 — IdP sub → participantId when AC-03 binding exists.
    return this.invoicing.listInvoicesForParticipant(req.user!.sub);
  }

  @Get("invoices/:id")
  @UseGuards(new ModuleAuthGuard({ roles: ["member"] }))
  async getOne(
    @Param("id") invoiceId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.invoicing.getPublicInvoiceForParticipant(
      invoiceId,
      req.user!.sub,
    );
  }

  @Get("invoices/:id/document")
  @UseGuards(new ModuleAuthGuard({ roles: ["member"] }))
  async getDocument(
    @Param("id") invoiceId: string,
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    // REQ-039 / A6 — PDF generated and stored by billing (no Stripe fetch).
    const { legalNumber, content } = await this.invoicing.getDocumentForCaller(
      invoiceId,
      req.user!.sub,
    );
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${legalNumber}.pdf"`,
    );
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).send(content);
  }

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
      communityId: req.user!.communityId,
    });
  }

  /**
   * REQ-061 / UAT-078 — manager payment reminder (manual trigger).
   */
  @Post("invoices/:id/reminders")
  @HttpCode(202)
  @UseGuards(new ModuleAuthGuard({ roles: ["manager"] }))
  async sendReminder(
    @Param("id") invoiceId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.invoicing.sendReminder(invoiceId, {
      actorId: req.user!.sub,
      communityId: req.user!.communityId,
      trigger: "manual",
    });
  }
}
