import {
  BadRequestException,
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Header,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
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
import { FakturaRecznaDto } from './dto/faktura-reczna.dto';
import { WystawKorekteDto } from './dto/korekta.dto';
import { KorektyService } from './korekty.service';

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
  constructor(
    private readonly invoices: InvoicesService,
    private readonly korekty: KorektyService,
  ) {}

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

  // ---------------------------------------------------------------------------
  // Z-01 — wystawianie ręczne i dokańczanie
  // ---------------------------------------------------------------------------

  /**
   * Faktura spoza automatu: ugoda, rekompensata, usługa spoza cennika.
   *
   * Ta sama numeracja VFV, ten sam PDF, ta sama ścieżka do KSeF-a co przy
   * fakturach automatycznych. Bez tego każdy przypadek nietypowy wypycha
   * operatora poza system, do Worda i własnej numeracji — a numeracja faktur
   * ma być jedna i ciągła.
   */
  @Post('reczna')
  @HttpCode(201)
  @UseGuards(StaffPermissionsGuard)
  @Roles(Role.ADMIN, Role.STAFF)
  @StaffPerm('BILLING_MANAGE')
  async wystawReczna(
    @Body() dto: FakturaRecznaDto,
    @CurrentUser() aktor: { userId: string },
  ) {
    return this.invoices.wystawReczna({
      userId: dto.userId,
      pozycje: dto.pozycje,
      waluta: dto.waluta,
      powod: dto.powod,
      aktorUserId: aktor.userId,
    });
  }

  /**
   * Wymuszenie dokończenia faktury bez PDF-u.
   *
   * Job próbuje sam, z narastającym odstępem, ale po usunięciu przyczyny
   * (podniesiony MinIO, uzupełnione dane sprzedawcy) nie ma powodu czekać
   * na kolejną próbę.
   */
  @Post(':invoiceId/dokoncz')
  @HttpCode(200)
  @UseGuards(StaffPermissionsGuard)
  @Roles(Role.ADMIN, Role.STAFF)
  @StaffPerm('BILLING_MANAGE')
  async dokoncz(@Param('invoiceId') invoiceId: string) {
    return this.invoices.dokonczFakture(invoiceId);
  }


  // ---------------------------------------------------------------------------
  // M-06 — faktury korygujące
  // ---------------------------------------------------------------------------

  /**
   * Wystawia korektę do faktury.
   *
   * Korekta zmniejszająca zwraca różnicę do portfela klienta W TEJ SAMEJ
   * transakcji co dokument. Klient widzi jedno zdarzenie („oddaliście mi
   * pieniądze"), więc system też zapisuje je jako jedno.
   */
  @Post(':invoiceId/korekta')
  @HttpCode(201)
  @UseGuards(StaffPermissionsGuard)
  @Roles(Role.ADMIN, Role.STAFF)
  @StaffPerm('BILLING_MANAGE')
  async wystawKorekte(
    @Param('invoiceId') invoiceId: string,
    @Body() dto: WystawKorekteDto,
    @CurrentUser() aktor: { userId: string },
  ) {
    return this.korekty.wystaw({
      invoiceId,
      rodzaj: dto.rodzaj,
      przyczyna: dto.przyczyna,
      pozycjePo: dto.pozycjePo,
      nabywcaPo: dto.nabywcaPo,
      aktorUserId: aktor.userId,
    });
  }

  /** Korekty wystawione do danej faktury. */
  @Get(':invoiceId/korekty')
  @UseGuards(StaffPermissionsGuard)
  @Roles(Role.ADMIN, Role.STAFF)
  @StaffPerm('BILLING_VIEW')
  async listaKorekt(@Param('invoiceId') invoiceId: string) {
    const rows = await this.korekty.listaDlaFaktury(invoiceId);
    return rows.map((k) => ({
      id: k.id,
      number: k.number,
      correctionKind: k.correctionKind,
      correctionReason: k.correctionReason,
      roznicaBrutto: k.amount.toFixed(2),
      bruttoPrzed: k.correctedAmount?.toFixed(2) ?? null,
      currency: k.currency,
      issuedAt: k.issuedAt,
      storageKey: k.storageKey,
    }));
  }

}
