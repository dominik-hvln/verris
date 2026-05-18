import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { LegalDocument, LegalDocumentKind } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { RodoActions } from '../common/audit/audit.actions';

export interface PublicLegalDocumentDto {
  kind: LegalDocumentKind;
  version: string;
  locale: string;
  title: string;
  contentMarkdown: string;
  changelogMarkdown: string | null;
  publishedAt: string;
}

export interface LegalVersionDto {
  version: string;
  publishedAt: string;
  isCurrent: boolean;
}

/**
 * Versioned legal documents (Terms, Privacy, Cookies, DPA).
 *
 * Reads:
 *  - Public `getCurrent(kind, locale)` for `/legal/<kind>` pages.
 *  - Public `listVersions(kind, locale)` for transparency archives.
 *
 * Admin writes (Sprint 1, L-08):
 *  - `publish(kind, version, ...)` creates a new row and atomically flips
 *    `isCurrent` on the kind+locale tuple. Triggers re-consent flow on next
 *    request from each user (RequireCurrentConsentGuard reads
 *    `User.lastConsentVersionTerms/Privacy`).
 *
 * IMPORTANT: there can be 0 published versions for a kind (e.g. before lawyer
 * review). In that case `getCurrent` returns null — the registration form
 * blocks signup with a clean error rather than skipping consent.
 */
@Injectable()
export class LegalDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------------------
  // Public reads
  // ---------------------------------------------------------------------------

  async getCurrent(kind: LegalDocumentKind, locale = 'pl'): Promise<PublicLegalDocumentDto | null> {
    const doc = await this.prisma.legalDocument.findFirst({
      where: { kind, locale, isCurrent: true },
      orderBy: { publishedAt: 'desc' },
    });
    return doc ? this.toPublicDto(doc) : null;
  }

  async getCurrentMap(locale = 'pl'): Promise<
    Record<LegalDocumentKind, PublicLegalDocumentDto | null>
  > {
    const rows = await this.prisma.legalDocument.findMany({
      where: { locale, isCurrent: true },
    });
    const out = {
      TERMS: null,
      PRIVACY: null,
      COOKIES: null,
      DPA: null,
    } as Record<LegalDocumentKind, PublicLegalDocumentDto | null>;
    for (const row of rows) {
      out[row.kind] = this.toPublicDto(row);
    }
    return out;
  }

  async listVersions(kind: LegalDocumentKind, locale = 'pl'): Promise<LegalVersionDto[]> {
    const rows = await this.prisma.legalDocument.findMany({
      where: { kind, locale },
      orderBy: { publishedAt: 'desc' },
      select: { version: true, publishedAt: true, isCurrent: true },
    });
    return rows.map((row) => ({
      version: row.version,
      publishedAt: row.publishedAt.toISOString(),
      isCurrent: row.isCurrent,
    }));
  }

  async getByVersion(
    kind: LegalDocumentKind,
    version: string,
    locale = 'pl',
  ): Promise<PublicLegalDocumentDto> {
    const doc = await this.prisma.legalDocument.findUnique({
      where: { kind_version_locale: { kind, version, locale } },
    });
    if (!doc) throw new NotFoundException(`Legal document ${kind}@${version} (${locale}) not found`);
    return this.toPublicDto(doc);
  }

  // ---------------------------------------------------------------------------
  // Admin writes (called by ComplianceAdminController, L-08)
  // ---------------------------------------------------------------------------

  async publish(input: {
    kind: LegalDocumentKind;
    version: string;
    locale?: string;
    title: string;
    contentMarkdown: string;
    changelogMarkdown?: string;
    publishedById: string;
  }): Promise<PublicLegalDocumentDto> {
    const locale = input.locale ?? 'pl';
    if (!/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(input.version)) {
      throw new BadRequestException(
        `Version must be semver-like (e.g. "1.0.0", "2.1.0", "1.0.0-rc.1"). Got: ${input.version}`,
      );
    }
    if (input.contentMarkdown.trim().length < 200) {
      throw new BadRequestException(
        'Treść dokumentu jest podejrzanie krótka (<200 znaków). Sprawdź czy to nie pomyłka.',
      );
    }

    const created = await this.prisma.$transaction(async (tx) => {
      // Demote any existing `isCurrent` row in the same kind+locale.
      await tx.legalDocument.updateMany({
        where: { kind: input.kind, locale, isCurrent: true },
        data: { isCurrent: false },
      });
      // Upsert by (kind, version, locale) — re-publishing the same version is
      // a no-op except it flips `isCurrent` back to true.
      return tx.legalDocument.upsert({
        where: {
          kind_version_locale: { kind: input.kind, version: input.version, locale },
        },
        create: {
          kind: input.kind,
          version: input.version,
          locale,
          title: input.title,
          contentMarkdown: input.contentMarkdown,
          changelogMarkdown: input.changelogMarkdown ?? null,
          publishedById: input.publishedById,
          isCurrent: true,
        },
        update: {
          title: input.title,
          contentMarkdown: input.contentMarkdown,
          changelogMarkdown: input.changelogMarkdown ?? null,
          publishedById: input.publishedById,
          publishedAt: new Date(),
          isCurrent: true,
        },
      });
    });

    await this.audit.record({
      action: RodoActions.LEGAL_DOC_VERSION_PUBLISHED,
      actorUserId: input.publishedById,
      details: {
        kind: input.kind,
        version: input.version,
        locale,
        title: input.title,
      },
    });

    return this.toPublicDto(created);
  }

  /**
   * Demote a published version without publishing a replacement. Useful if a
   * version was released by mistake — admin demotes it and re-publishes a
   * fixed one.
   */
  async retire(kind: LegalDocumentKind, version: string, locale: string, actorId: string) {
    const updated = await this.prisma.legalDocument.update({
      where: { kind_version_locale: { kind, version, locale } },
      data: { isCurrent: false },
    });
    await this.audit.record({
      action: RodoActions.LEGAL_DOC_VERSION_RETIRED,
      actorUserId: actorId,
      details: { kind, version, locale },
    });
    return updated;
  }

  // ---------------------------------------------------------------------------
  // Internal helpers used by ConsentsService / re-consent guard
  // ---------------------------------------------------------------------------

  /**
   * Same as `getCurrent` but returns the *full* row (including DB id) for
   * internal callers needing FK linkage. Public callers must go through
   * `getCurrent` to get the sanitized DTO.
   */
  async getCurrentRow(kind: LegalDocumentKind, locale = 'pl'): Promise<LegalDocument | null> {
    return this.prisma.legalDocument.findFirst({
      where: { kind, locale, isCurrent: true },
      orderBy: { publishedAt: 'desc' },
    });
  }

  private toPublicDto(doc: LegalDocument): PublicLegalDocumentDto {
    return {
      kind: doc.kind,
      version: doc.version,
      locale: doc.locale,
      title: doc.title,
      contentMarkdown: doc.contentMarkdown,
      changelogMarkdown: doc.changelogMarkdown,
      publishedAt: doc.publishedAt.toISOString(),
    };
  }
}
