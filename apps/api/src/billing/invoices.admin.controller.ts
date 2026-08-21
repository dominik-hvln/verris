import {
  BadRequestException,
  Controller,
  DefaultValuePipe,
  Get,
  Header,
  HttpCode,
  Param,
  ParseIntPipe,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { InvoiceStatus, Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard';
import { StaffPerm } from '../common/decorators/staff-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestContext } from '../common/decorators/request-context';
import type { RequestContextDto } from '../common/decorators/request-context';
import { InvoicesService } from './invoices.service';

const VALID_STATUSES: InvoiceStatus[] = [
  InvoiceStatus.DRAFT,
  InvoiceStatus.OPEN,
  InvoiceStatus.PAID,
  InvoiceStatus.VOID,
  InvoiceStatus.UNCOLLECTIBLE,
];

function parseStatusList(raw: string | undefined): InvoiceStatus[] | undefined {
  if (!raw) return undefined;
  const parts = raw
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean) as InvoiceStatus[];
  for (const p of parts) {
    if (!VALID_STATUSES.includes(p)) {
      throw new BadRequestException(`Niepoprawny status faktury: ${p}`);
    }
  }
  return parts.length > 0 ? parts : undefined;
}

function parseDate(raw: string | undefined, label: string): Date | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestException(`${label}: nieprawidłowa data (oczekiwany ISO 8601).`);
  }
  return d;
}

@Controller('admin/invoices')
@UseGuards(JwtAuthGuard, RolesGuard, StaffPermissionsGuard)
@Roles(Role.ADMIN, Role.STAFF)
@StaffPerm('BILLING_VIEW')
export class InvoicesAdminController {
  constructor(private readonly invoices: InvoicesService) {}

  /**
   * Sprint 4 / R-10 — admin lista faktur z filtrami.
   * Dostęp: ADMIN i STAFF (operator może podejrzeć/wesprzeć klienta).
   */
  @Get()
  @HttpCode(200)
  list(
    @Query('search') search: string | undefined,
    @Query('userId') userId: string | undefined,
    @Query('status') status: string | undefined,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    return this.invoices.listForAdmin({
      search: search?.trim() || undefined,
      userId: userId?.trim() || undefined,
      statuses: parseStatusList(status),
      from: parseDate(from, 'from'),
      to: parseDate(to, 'to'),
      limit,
      offset,
    });
  }

  @Get('export.csv')
  @Header('Cache-Control', 'no-store')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportCsv(
    @Query('search') search: string | undefined,
    @Query('userId') userId: string | undefined,
    @Query('status') status: string | undefined,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Res() res: Response,
    @CurrentUser() actor: { userId: string },
    @RequestContext() ctx: RequestContextDto,
  ): Promise<void> {
    const csv = await this.invoices.exportCsvForAdmin(
      {
        search: search?.trim() || undefined,
        userId: userId?.trim() || undefined,
        statuses: parseStatusList(status),
        from: parseDate(from, 'from'),
        to: parseDate(to, 'to'),
      },
      { actorUserId: actor.userId, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent },
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="verris-faktury-${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    res.send(csv);
  }

  @Get(':id')
  @HttpCode(200)
  detail(@Param('id') id: string) {
    return this.invoices.getForAdmin(id);
  }

  /** Admin/staff PDF download z auditem. */
  @Get(':id/pdf')
  @Header('Cache-Control', 'no-store')
  async pdf(
    @Param('id') id: string,
    @Res() res: Response,
    @CurrentUser() actor: { userId: string },
    @RequestContext() ctx: RequestContextDto,
  ): Promise<void> {
    const { stream, filename } = await this.invoices.openAdminPdfStream(id, {
      actorUserId: actor.userId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    stream.on('error', (err) => res.destroy(err));
    stream.pipe(res);
  }
}
