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
  listMine(@Req() req: AuthenticatedRequest) {
    return this.invoicing.listInvoicesForParticipant(req.user!.sub);
  }

  @Get("invoices/:id")
  @UseGuards(new ModuleAuthGuard({ roles: ["member"] }))
  getOne(@Param("id") invoiceId: string, @Req() req: AuthenticatedRequest) {
    return this.invoicing.getPublicInvoiceForParticipant(
      invoiceId,
      req.user!.sub,
    );
  }

  @Get("invoices/:id/document")
  @UseGuards(new ModuleAuthGuard({ roles: ["member"] }))
  getDocument(
    @Param("id") invoiceId: string,
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    const { url } = this.invoicing.getDocumentUrlForParticipant(
      invoiceId,
      req.user!.sub,
    );
    // REQ-039 — provider hosts the PDF; redirect to Stripe hosted URL.
    return res.redirect(302, url);
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
    });
  }
}
