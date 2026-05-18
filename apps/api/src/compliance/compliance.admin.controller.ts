import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { Request } from 'express';
import { LegalDocumentKind, Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { extractRequestContext } from '../common/decorators/request-context';
import { LegalDocumentsService } from './legal-documents.service';
import { ConsentsService } from './consents.service';
import { DataExportService } from './data-export.service';
import { AccountDeletionService } from './account-deletion.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { RodoActions } from '../common/audit/audit.actions';

class PublishLegalDocDto {
  @IsEnum(LegalDocumentKind)
  kind!: LegalDocumentKind;

  @IsString()
  @Length(5, 30)
  version!: string;

  @IsOptional()
  @IsString()
  @Length(2, 8)
  locale?: string;

  @IsString()
  @Length(3, 200)
  title!: string;

  @IsString()
  @MinLength(200)
  contentMarkdown!: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  changelogMarkdown?: string;
}

class ConsentsQuery {
  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsEnum(LegalDocumentKind)
  kind?: LegalDocumentKind;

  @IsOptional()
  @IsString()
  version?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  offset?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number;
}

class ForceAnonymizeDto {
  @IsString()
  @MinLength(3)
  reason!: string;
}

/**
 * Sprint 1 / L-08 — admin "Compliance" tab API.
 *
 * Routes (all require ADMIN role):
 *  - `GET    /admin/compliance/documents`                                — list latest version per kind
 *  - `GET    /admin/compliance/documents/:kind/versions`                  — full archive
 *  - `POST   /admin/compliance/documents/publish`                         — publish a new version
 *  - `GET    /admin/compliance/consents`                                  — list consents (filterable)
 *  - `GET    /admin/compliance/data-exports`                              — list exports
 *  - `POST   /admin/compliance/data-exports/:id/retry`                    — retry FAILED export
 *  - `GET    /admin/compliance/deletion-requests`                         — list deletion requests
 *  - `POST   /admin/compliance/deletion-requests/:userId/force-anonymize` — admin override (UODO)
 */
@Controller('admin/compliance')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class ComplianceAdminController {
  constructor(
    private readonly legal: LegalDocumentsService,
    private readonly consents: ConsentsService,
    private readonly dataExport: DataExportService,
    private readonly deletion: AccountDeletionService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------------------
  // Legal documents
  // ---------------------------------------------------------------------------

  @Get('documents')
  async listDocuments(@Query('locale') locale = 'pl') {
    return this.legal.getCurrentMap(locale);
  }

  @Get('documents/:kind/versions')
  listVersions(
    @Param('kind', new ParseEnumPipe(LegalDocumentKind)) kind: LegalDocumentKind,
    @Query('locale') locale = 'pl',
  ) {
    return this.legal.listVersions(kind, locale);
  }

  @Post('documents/publish')
  publish(
    @Body() dto: PublishLegalDocDto,
    @CurrentUser() actor: { userId: string },
  ) {
    return this.legal.publish({
      kind: dto.kind,
      version: dto.version,
      locale: dto.locale,
      title: dto.title,
      contentMarkdown: dto.contentMarkdown,
      changelogMarkdown: dto.changelogMarkdown,
      publishedById: actor.userId,
    });
  }

  // ---------------------------------------------------------------------------
  // Consents
  // ---------------------------------------------------------------------------

  @Get('consents')
  listConsents(@Query() query: ConsentsQuery) {
    return this.consents.adminList({
      userId: query.userId,
      kind: query.kind,
      version: query.version,
      limit: query.limit,
      offset: query.offset,
    });
  }

  // ---------------------------------------------------------------------------
  // Data exports
  // ---------------------------------------------------------------------------

  @Get('data-exports')
  async listDataExports(@Query('limit') limitRaw?: string) {
    const limit = Math.min(Math.max(Number(limitRaw ?? '100'), 1), 500);
    return this.prisma.dataExportRequest.findMany({
      orderBy: { requestedAt: 'desc' },
      take: limit,
      include: {
        user: { select: { id: true, email: true, anonymizedAt: true } },
      },
    });
  }

  @Post('data-exports/:id/retry')
  async retryDataExport(
    @Param('id') id: string,
    @CurrentUser() actor: { userId: string },
    @Req() req: Request,
  ) {
    const row = await this.prisma.dataExportRequest.findUnique({ where: { id } });
    if (!row) throw new BadRequestException('Brak takiego eksportu.');
    void this.dataExport.generateInBackground(id);
    await this.audit.record({
      action: RodoActions.ADMIN_FORCED_DATA_EXPORT,
      actorUserId: actor.userId,
      userId: row.userId,
      details: { exportRequestId: id, reason: 'admin_retry' },
      ...extractRequestContext(req),
    });
    return { ok: true, message: 'Retry wkolejkowany.' };
  }

  // ---------------------------------------------------------------------------
  // Account deletion requests
  // ---------------------------------------------------------------------------

  @Get('deletion-requests')
  listDeletionRequests() {
    return this.prisma.accountDeletionRequest.findMany({
      orderBy: { requestedAt: 'desc' },
      take: 200,
      include: {
        user: { select: { id: true, email: true, anonymizedAt: true } },
        anonymizedByAdmin: { select: { id: true, email: true } },
      },
    });
  }

  @Post('deletion-requests/:userId/force-anonymize')
  async forceAnonymize(
    @Param('userId') userId: string,
    @Body() dto: ForceAnonymizeDto,
    @CurrentUser() actor: { userId: string },
    @Req() req: Request,
  ) {
    if (actor.userId === userId) {
      throw new BadRequestException('Admin nie może zanonimizować własnego konta przez ten endpoint.');
    }

    // Ensure a deletion request exists (admin force = also creates one if
    // missing, e.g. UODO request without prior user request).
    const existing = await this.prisma.accountDeletionRequest.findUnique({ where: { userId } });
    if (!existing) {
      const now = new Date();
      await this.prisma.accountDeletionRequest.create({
        data: {
          userId,
          requestedAt: now,
          scheduledFor: now,
          reason: `[ADMIN] ${dto.reason}`,
        },
      });
    } else if (existing.cancelledAt || existing.anonymizedAt) {
      throw new BadRequestException('Wniosek już anulowany lub konto już zanonimizowane.');
    }

    await this.deletion.executeAnonymization(userId, actor.userId);
    await this.audit.record({
      action: RodoActions.ADMIN_FORCED_ACCOUNT_ANONYMIZED,
      actorUserId: actor.userId,
      userId,
      details: { reason: dto.reason },
      ...extractRequestContext(req),
    });
    return { ok: true };
  }
}
