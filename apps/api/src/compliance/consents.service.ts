import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConsentSource, LegalDocumentKind, Prisma, UserConsent } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { LegalDocumentsService } from './legal-documents.service';
import { RodoActions } from '../common/audit/audit.actions';
import { MailerService } from '../mail/mailer.service';
import { ConfigService } from '@nestjs/config';
import { dpaAcceptedTemplate } from '../mail/templates/dpa-notifications';

export interface ConsentRequestContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface ReConsentRequiredPayload {
  required: true;
  docs: Array<{
    kind: LegalDocumentKind;
    currentVersion: string;
    userVersion: string | null;
    title: string;
    publishedAt: string;
    changelogMarkdown: string | null;
  }>;
}

export interface ReConsentNotRequired {
  required: false;
}

export type ReConsentCheckResult = ReConsentRequiredPayload | ReConsentNotRequired;

/**
 * Per-user consent grants and withdrawals (RODO Art. 7 audit trail).
 *
 * Two API surfaces:
 *  - `recordConsents(...)` — called by AuthService.register on signup.
 *  - `acceptCurrent(...)` — called by `POST /me/consent/accept-current` from
 *    the re-consent modal.
 *
 * Re-consent enforcement happens via `RequireCurrentConsentGuard` which calls
 * `checkReConsent(userId)` on every authenticated request.
 */
@Injectable()
export class ConsentsService {
  private readonly logger = new Logger(ConsentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly legal: LegalDocumentsService,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {}

  // ---------------------------------------------------------------------------
  // Registration path
  // ---------------------------------------------------------------------------

  /**
   * Records terms+privacy consents on user creation. Throws if either kind has
   * no published current version (block signup until lawyer review is in).
   *
   * MUST be called inside the same Prisma transaction as User creation so that
   * both rollback together if anything fails.
   */
  async recordRegistrationConsents(
    tx: Prisma.TransactionClient,
    userId: string,
    ctx: ConsentRequestContext,
  ): Promise<{ termsVersion: string; privacyVersion: string }> {
    const [terms, privacy] = await Promise.all([
      this.legal.getCurrentRow('TERMS', 'pl'),
      this.legal.getCurrentRow('PRIVACY', 'pl'),
    ]);
    if (!terms || !privacy) {
      throw new ForbiddenException(
        'Verris nie publikuje obecnie panelu klienta — brak zatwierdzonych dokumentów prawnych. Skontaktuj się z administratorem.',
      );
    }

    const now = new Date();
    await tx.user.update({
      where: { id: userId },
      data: {
        termsAcceptedAt: now,
        privacyAcceptedAt: now,
        lastConsentVersionTerms: terms.version,
        lastConsentVersionPrivacy: privacy.version,
      },
    });

    await tx.userConsent.createMany({
      data: [
        {
          userId,
          documentKind: terms.kind,
          documentVersion: terms.version,
          locale: terms.locale,
          documentId: terms.id,
          ipAddress: ctx.ipAddress ?? null,
          userAgent: ctx.userAgent ?? null,
          source: ConsentSource.REGISTRATION,
        },
        {
          userId,
          documentKind: privacy.kind,
          documentVersion: privacy.version,
          locale: privacy.locale,
          documentId: privacy.id,
          ipAddress: ctx.ipAddress ?? null,
          userAgent: ctx.userAgent ?? null,
          source: ConsentSource.REGISTRATION,
        },
      ],
    });

    return { termsVersion: terms.version, privacyVersion: privacy.version };
  }

  // ---------------------------------------------------------------------------
  // Re-consent path (modal in client panel)
  // ---------------------------------------------------------------------------

  async checkReConsent(userId: string): Promise<ReConsentCheckResult> {
    const [user, terms, privacy] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          lastConsentVersionTerms: true,
          lastConsentVersionPrivacy: true,
          anonymizedAt: true,
        },
      }),
      this.legal.getCurrentRow('TERMS', 'pl'),
      this.legal.getCurrentRow('PRIVACY', 'pl'),
    ]);

    // Anonimizowane konta — guard ich nie blokuje (nie są aktywne, nie ma
    // do czego logować). Konsystentne zachowanie z `JwtAuthGuard`.
    if (!user || user.anonymizedAt) return { required: false };

    // Brak dokumentów (np. seed bez lawyer review) — nie wymuszamy modala.
    // To krytyczne: klienci nie mogliby się zalogować jeśli admin zapomniał
    // opublikować v1.0.0. Opcjonalnie: można podnieść `503 NOT_PUBLISHED`,
    // ale żeby nie zablokować całego panelu, zwracamy `required: false` i
    // logujemy ostrzeżenie operacyjne wyżej (admin Compliance dashboard).
    if (!terms && !privacy) return { required: false };

    const docs: ReConsentRequiredPayload['docs'] = [];

    if (terms && user.lastConsentVersionTerms !== terms.version) {
      docs.push({
        kind: 'TERMS',
        currentVersion: terms.version,
        userVersion: user.lastConsentVersionTerms,
        title: terms.title,
        publishedAt: terms.publishedAt.toISOString(),
        changelogMarkdown: terms.changelogMarkdown,
      });
    }
    if (privacy && user.lastConsentVersionPrivacy !== privacy.version) {
      docs.push({
        kind: 'PRIVACY',
        currentVersion: privacy.version,
        userVersion: user.lastConsentVersionPrivacy,
        title: privacy.title,
        publishedAt: privacy.publishedAt.toISOString(),
        changelogMarkdown: privacy.changelogMarkdown,
      });
    }

    return docs.length > 0 ? { required: true, docs } : { required: false };
  }

  /**
   * Sprint 1 / L-11 — accept current DPA version (B2B).
   *
   * Available only to clients that have `companyName` or `nip` filled in
   * (controller enforces). Generates a `UserConsent` row with kind=DPA, no
   * mutation of `User.lastConsentVersion*` because DPA is not part of the
   * re-consent flow (DPA changes only require explicit acceptance, never
   * blocking the panel).
   *
   * Side-effects:
   *  - emits `DPA_ACCEPTED` audit log,
   *  - sends a confirmation email with a link to download the personalized
   *    PDF (`GET /me/dpa.pdf` — generated on demand by `DpaPdfService`).
   */
  async acceptDpa(userId: string, ctx: ConsentRequestContext): Promise<{ version: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        companyName: true,
        nip: true,
        anonymizedAt: true,
        email: true,
        firstName: true,
      },
    });
    if (!user || user.anonymizedAt) {
      throw new BadRequestException('Konto nieaktywne.');
    }
    if (!user.companyName && !user.nip) {
      throw new BadRequestException(
        'DPA jest dostępne wyłącznie dla klientów biznesowych (firma/NIP). Uzupełnij dane do faktury w ustawieniach.',
      );
    }

    const dpa = await this.legal.getCurrentRow('DPA', 'pl');
    if (!dpa) {
      throw new BadRequestException(
        'Aktualnie nie publikujemy DPA — skontaktuj się z biurem obsługi klienta.',
      );
    }

    await this.prisma.userConsent.create({
      data: {
        userId,
        documentKind: dpa.kind,
        documentVersion: dpa.version,
        locale: dpa.locale,
        documentId: dpa.id,
        ipAddress: ctx.ipAddress ?? null,
        userAgent: ctx.userAgent ?? null,
        source: ConsentSource.SETTINGS,
      },
    });

    await this.audit.record({
      action: RodoActions.DPA_ACCEPTED,
      userId,
      actorUserId: userId,
      details: { kind: 'DPA', version: dpa.version, source: 'SETTINGS' },
      ipAddress: ctx.ipAddress ?? undefined,
      userAgent: ctx.userAgent ?? undefined,
    });

    // Notify the client — DPA is a B2B legal artifact, the client expects a
    // tangible confirmation with a downloadable PDF.
    void this.notifyDpaAccepted(user.email, user.firstName, dpa.version).catch((err) => {
      this.logger.warn(
        `notifyDpaAccepted failed for userId=${userId}: ${(err as Error).message}`,
      );
    });

    return { version: dpa.version };
  }

  private async notifyDpaAccepted(
    to: string,
    firstName: string | null,
    dpaVersion: string,
  ): Promise<void> {
    const apiUrl =
      this.config.get<string>('PUBLIC_API_URL') ??
      this.config.get<string>('publicApiUrl') ??
      'https://api.verris.pl';
    const panelUrl =
      this.config.get<string>('CLIENT_PANEL_URL') ??
      this.config.get<string>('clientPanelUrl') ??
      'https://panel.verris.pl';

    const message = dpaAcceptedTemplate({
      to,
      firstName,
      dpaVersion,
      pdfUrl: `${apiUrl}/me/dpa.pdf`,
      panelUrl,
    });
    await this.mailer.send({ ...message, category: 'TRANSACTIONAL', fromRole: 'RODO' });
  }

  async acceptCurrent(userId: string, ctx: ConsentRequestContext): Promise<void> {
    const check = await this.checkReConsent(userId);
    if (!check.required) {
      throw new BadRequestException(
        'Nie ma aktualnie żadnych dokumentów wymagających ponownej akceptacji.',
      );
    }

    const [terms, privacy] = await Promise.all([
      this.legal.getCurrentRow('TERMS', 'pl'),
      this.legal.getCurrentRow('PRIVACY', 'pl'),
    ]);

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const consentRows: Prisma.UserConsentCreateManyInput[] = [];
      const userUpdate: Prisma.UserUpdateInput = {};

      for (const doc of check.docs) {
        const row = doc.kind === 'TERMS' ? terms : privacy;
        if (!row) continue;
        consentRows.push({
          userId,
          documentKind: row.kind,
          documentVersion: row.version,
          locale: row.locale,
          documentId: row.id,
          ipAddress: ctx.ipAddress ?? null,
          userAgent: ctx.userAgent ?? null,
          source: ConsentSource.RE_CONSENT,
        });
        if (doc.kind === 'TERMS') {
          userUpdate.termsAcceptedAt = now;
          userUpdate.lastConsentVersionTerms = row.version;
        } else {
          userUpdate.privacyAcceptedAt = now;
          userUpdate.lastConsentVersionPrivacy = row.version;
        }
      }

      if (consentRows.length === 0) return;

      await tx.userConsent.createMany({ data: consentRows });
      await tx.user.update({ where: { id: userId }, data: userUpdate });
    });

    await this.audit.record({
      action: RodoActions.RE_CONSENT_GRANTED,
      userId,
      details: {
        docs: check.docs.map((d) => ({ kind: d.kind, version: d.currentVersion })),
      },
      ipAddress: ctx.ipAddress ?? undefined,
      userAgent: ctx.userAgent ?? undefined,
    });
  }

  // ---------------------------------------------------------------------------
  // Settings path: read user's consent history
  // ---------------------------------------------------------------------------

  async listForUser(userId: string): Promise<UserConsent[]> {
    return this.prisma.userConsent.findMany({
      where: { userId },
      orderBy: { grantedAt: 'desc' },
    });
  }

  /**
   * Admin lookup: list consents across users with optional filters. Used by
   * the admin Compliance tab for UODO data subject requests.
   */
  async adminList(filters: {
    userId?: string;
    kind?: LegalDocumentKind;
    version?: string;
    limit?: number;
    offset?: number;
  }) {
    const where: Prisma.UserConsentWhereInput = {};
    if (filters.userId) where.userId = filters.userId;
    if (filters.kind) where.documentKind = filters.kind;
    if (filters.version) where.documentVersion = filters.version;

    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 500);
    const offset = Math.max(filters.offset ?? 0, 0);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.userConsent.findMany({
        where,
        orderBy: { grantedAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          user: { select: { id: true, email: true, anonymizedAt: true } },
        },
      }),
      this.prisma.userConsent.count({ where }),
    ]);
    return { rows, total, limit, offset };
  }
}
