import { Controller, Get, NotFoundException, Param, ParseEnumPipe, Query } from '@nestjs/common';
import { LegalDocumentKind } from '@verris/database';
import {
  LegalDocumentsService,
  LegalVersionDto,
  PublicLegalDocumentDto,
} from './legal-documents.service';

/**
 * Public, no-auth API for `/legal/*` pages and footer links.
 *
 * - `GET /legal/:kind` returns the *current* published version (Markdown).
 * - `GET /legal/:kind/versions` returns the version archive (transparency).
 * - `GET /legal/:kind/version/:version` returns a specific historical version.
 *
 * The Next.js client panel calls these via server components so the markup is
 * pre-rendered (good for SEO and crawlers).
 *
 * If no published version exists for a kind (e.g. before lawyer review), the
 * endpoint returns 404 — front-end shows a "Dokument w przygotowaniu" page
 * with link to support contact.
 */
@Controller('legal')
export class LegalDocumentsController {
  constructor(private readonly service: LegalDocumentsService) {}

  /** All current versions, keyed by kind. Used by the registration form to
   *  resolve consent versions in a single round-trip. */
  @Get()
  async getAllCurrent(
    @Query('locale') locale = 'pl',
  ): Promise<Record<LegalDocumentKind, PublicLegalDocumentDto | null>> {
    return this.service.getCurrentMap(locale);
  }

  @Get(':kind')
  async getCurrent(
    @Param('kind', new ParseEnumPipe(LegalDocumentKind))
    kind: LegalDocumentKind,
    @Query('locale') locale = 'pl',
  ): Promise<PublicLegalDocumentDto> {
    const doc = await this.service.getCurrent(kind, locale);
    if (!doc) {
      throw new NotFoundException(`Brak opublikowanej wersji dokumentu ${kind} (${locale}).`);
    }
    return doc;
  }

  @Get(':kind/versions')
  listVersions(
    @Param('kind', new ParseEnumPipe(LegalDocumentKind))
    kind: LegalDocumentKind,
    @Query('locale') locale = 'pl',
  ): Promise<LegalVersionDto[]> {
    return this.service.listVersions(kind, locale);
  }

  @Get(':kind/version/:version')
  getByVersion(
    @Param('kind', new ParseEnumPipe(LegalDocumentKind))
    kind: LegalDocumentKind,
    @Param('version') version: string,
    @Query('locale') locale = 'pl',
  ): Promise<PublicLegalDocumentDto> {
    return this.service.getByVersion(kind, version, locale);
  }
}
