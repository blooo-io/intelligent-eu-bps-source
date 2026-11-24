import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ModuleAuthGuard,
  type AuthenticatedRequest,
} from "@intelligent/module-template";
import type { StatementRecord } from "../domain/statement-store.js";
import { StatementsService } from "./statements.service.js";

/** Contract `Statement` (public.v1) has additionalProperties: false — no store timestamps. */
function toStatement(row: StatementRecord) {
  return {
    statementId: row.statementId,
    participantId: row.participantId,
    communityId: row.communityId,
    period: row.period,
    periodFrom: row.periodFrom,
    periodUntil: row.periodUntil,
    totalBought: row.totalBought,
    totalSold: row.totalSold,
    netBalance: row.netBalance,
    direction: row.direction,
    currency: row.currency,
    invoiceIds: row.invoiceIds,
    status: row.status,
    revision: row.revision,
  };
}

/** REQ-059 / REQ-010 — the caller's own monthly statements (informative, never payable). */
@Controller("v1")
export class PublicStatementsController {
  constructor(
    @Inject(StatementsService) private readonly statements: StatementsService,
  ) {}

  @Get("me/statements")
  @UseGuards(new ModuleAuthGuard({ roles: ["member"] }))
  async listMine(@Req() req: AuthenticatedRequest) {
    const rows = await this.statements.listForParticipant(req.user!.sub);
    return rows.map(toStatement);
  }
}

/** REQ-059 / REQ-049 — ListStatements(participantId, period?) for AC-09 and operator tools. */
@Controller("internal/v1")
@UseGuards(new ModuleAuthGuard({ roles: ["service", "operator"] }))
export class InternalStatementsController {
  constructor(
    @Inject(StatementsService) private readonly statements: StatementsService,
  ) {}

  @Get("statements")
  async list(
    @Query("participantId") participantId?: string,
    @Query("period") period?: string,
  ) {
    if (!participantId) throw new BadRequestException("participantId is required");
    const rows = await this.statements.listInternal(participantId, period);
    return rows.map((row) => ({ ...toStatement(row), invoices: row.invoices }));
  }
}
