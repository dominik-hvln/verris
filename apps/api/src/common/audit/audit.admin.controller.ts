import {
  Controller,
  Get,
  Header,
  ParseIntPipe,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { Readable } from 'node:stream';
import { Role } from '@ekohost/database';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from '../decorators/roles.decorator';
import { AuditService, AuditLogWithUsers } from './audit.service';

@Controller('admin/audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AuditAdminController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(
    @Query('action') action?: string,
    @Query('userId') userId?: string,
    @Query('actorUserId') actorUserId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('search') search?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('offset', new ParseIntPipe({ optional: true })) offset?: number,
  ) {
    return this.audit.list({
      action,
      userId,
      actorUserId,
      search,
      from: parseDate(from),
      to: parseDate(to),
      limit,
      offset,
    });
  }

  @Get('export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="ekohost-audit-log.csv"')
  async exportCsv(
    @Res({ passthrough: true }) _res: Response,
    @Query('action') action?: string,
    @Query('userId') userId?: string,
    @Query('actorUserId') actorUserId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('search') search?: string,
  ) {
    const audit = this.audit;
    const filters = {
      action,
      userId,
      actorUserId,
      search,
      from: parseDate(from),
      to: parseDate(to),
    };

    // Stream to keep memory bounded — auditLog is unbounded by design and we
    // don't want a wide date range to OOM the API pod.
    const stream = Readable.from(
      (async function* () {
        yield csvRow([
          'createdAt',
          'action',
          'userId',
          'userEmail',
          'actorUserId',
          'actorEmail',
          'impersonatedBy',
          'ipAddress',
          'userAgent',
          'details',
        ]);
        for await (const row of audit.iterate(filters)) {
          yield csvRow(toCsvFields(row));
        }
      })(),
    );

    return new StreamableFile(stream);
  }
}

function parseDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function csvRow(fields: (string | number | null | undefined)[]): string {
  return fields.map(escapeCsv).join(',') + '\n';
}

function escapeCsv(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = typeof value === 'string' ? value : String(value);
  if (/[",\r\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function toCsvFields(row: AuditLogWithUsers): (string | number | null)[] {
  return [
    row.createdAt.toISOString(),
    row.action,
    row.userId ?? '',
    row.user?.email ?? '',
    row.actorUserId ?? '',
    row.actor?.email ?? '',
    row.impersonatedBy ?? '',
    row.ipAddress ?? '',
    row.userAgent ?? '',
    row.details ? JSON.stringify(row.details) : '',
  ];
}
