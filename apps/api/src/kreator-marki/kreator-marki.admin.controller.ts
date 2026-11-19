import { BadRequestException, Body, ConflictException, Controller, Delete, Get, HttpCode, NotFoundException, Param, Post, Put, UseGuards } from '@nestjs/common';
import { LegalDocumentKind, Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AiProviderService } from '../ai/ai-provider.service.js';
import { ZNANE_MODELE_AI, mnoznikOdczytuCache } from '../ai/ai-modele.js';
import { KontoTestoweDto } from '../kreator/dto/kreator-admin.dto.js';
import { miesiacUtc } from '../kreator/konfiguracja.js';
import { KonfiguracjaMarkiDto } from './dto/konfiguracja-marki.dto.js';
import { KonfiguracjaMarkiService } from './konfiguracja-marki.service.js';
import { cenyMarki, odczytajKonfiguracjeMarki, scalKonfiguracjeMarki, uzycieMarkiBezDanych, type KonfiguracjaMarki } from './konfiguracja-marki.js';

/** Obowiązujący dokument opisuje moduł, gdy wymienia go z nazwy (projekt: docs/legal/drafts/DO_ZATWIERDZENIA_kreator-marki.md). */
export const DOKUMENT_Z_KREATOREM_MARKI = /Kreator(?:a|em|ze|owi)?\s+marki/i;

export const BLAD_MODELU_MARKI = 'Nieznany model – wybierz model Anthropic z listy (ceny modeli są w Konfiguracji asystenta).';

/**
 * Kreator marki (paczka 130) – konfiguracja modułu w adminie. Te same strażniki i ten sam układ co Kreator stron
 * (kreator.admin.controller.ts): tylko ADMIN, modele tylko Anthropic z listy, konta testowe po e-mailu istniejącego
 * konta, audyt każdej zmiany. Ekran: Admin → Wiedza i AI → Kreator marki (/settings/kreator-marki).
 */
@Controller('admin/kreator-marki')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class KreatorMarkiAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: AiProviderService,
    private readonly konfiguracjaMarki: KonfiguracjaMarkiService,
  ) {}

  /** Modele do wyboru: znane modele Anthropic + modele claude-* dopisane z cenami w ustawieniach AI (jak Kreator stron). */
  private async modele() {
    const { ceny } = await this.provider.konfiguracja();
    const znane = ZNANE_MODELE_AI.filter((m) => m.dostawca === 'anthropic').map((m) => ({ model: m.model, nazwa: m.nazwa, wej: m.cenaWej, wyj: m.cenaWyj }));
    const dopisane = Object.entries(ceny)
      .filter(([m]) => m.startsWith('claude-') && !znane.some((z) => z.model === m))
      .map(([m, c]) => ({ model: m, nazwa: m, ...c }));
    return [...znane, ...dopisane].map(({ wej, wyj, ...m }) => ({
      ...m,
      cenaWej: ceny[m.model]?.wej ?? wej,
      cenaWyj: ceny[m.model]?.wyj ?? wyj,
      mnoznikOdczytuCache: mnoznikOdczytuCache(m.model),
    }));
  }

  private async konta(konf: KonfiguracjaMarki) {
    if (!konf.kontaTestowe.length) return [];
    const uzytkownicy = await this.prisma.user.findMany({
      where: { OR: [{ id: { in: konf.kontaTestowe } }, { email: { in: konf.kontaTestowe, mode: 'insensitive' } }] },
      select: { id: true, email: true },
    });
    return konf.kontaTestowe.map((wpis) => {
      const u = uzytkownicy.find((x) => x.id.toLowerCase() === wpis || x.email.toLowerCase() === wpis);
      return { wpis, email: u?.email ?? null, istnieje: !!u };
    });
  }

  private async dokument(kind: LegalDocumentKind) {
    const d = await this.prisma.legalDocument.findFirst({ where: { kind, locale: 'pl', isCurrent: true }, select: { version: true, contentMarkdown: true } });
    return { wersja: d?.version ?? null, wymieniaKreatorMarki: DOKUMENT_Z_KREATOREM_MARKI.test(d?.contentMarkdown ?? '') };
  }

  /**
   * GET /admin/kreator-marki/konfiguracja – konfiguracja, ceny brutto i netto (netto liczone z brutto), stan
   * dokumentów prawnych (Regulamin i Polityka prywatności muszą wymieniać moduł, zanim dostaną go wszyscy),
   * modele, konta testowe i użycie miesiąca (faza 1: `zrodlo: 'brak-danych'`).
   */
  @Get('konfiguracja')
  async konfiguracja() {
    const konfiguracja = await this.konfiguracjaMarki.konfiguracja();
    const [modele, konta, regulamin, polityka] = await Promise.all([
      this.modele(),
      this.konta(konfiguracja),
      this.dokument(LegalDocumentKind.TERMS),
      this.dokument(LegalDocumentKind.PRIVACY),
    ]);
    return {
      konfiguracja,
      ceny: cenyMarki(konfiguracja),
      kluczAnthropic: Boolean(this.provider.klucz('anthropic')),
      dokumenty: { regulamin, polityka },
      modele,
      konta,
      uzycie: uzycieMarkiBezDanych(miesiacUtc()),
    };
  }

  /** Zapis przez walidację DTO, potem scalenie i ta sama walidacja co odczyt z bazy; modele tylko z listy. */
  @Put('konfiguracja')
  async zapisz(@Body() body: KonfiguracjaMarkiDto, @CurrentUser() actor: { userId: string }) {
    const dozwolone = new Set((await this.modele()).map((m) => m.model));
    for (const m of [body.modelGeneracji, body.modelZmian]) if (m !== undefined && !dozwolone.has(m)) throw new BadRequestException(BLAD_MODELU_MARKI);
    const obecna = await this.konfiguracjaMarki.konfiguracja();
    // Lista kont testowych tylko przez osobne trasy (konto musi istnieć) – PUT jej nie zmienia.
    const konf = scalKonfiguracjeMarki(obecna, { ...body, kontaTestowe: obecna.kontaTestowe });
    await this.konfiguracjaMarki.zapisz(konf, actor.userId);
    return this.konfiguracja();
  }

  /** Konto testowe po adresie e-mail – tylko istniejące konto (literówka nie daje „cichego” braku dostępu). */
  @Post('konta-testowe')
  @HttpCode(200)
  async dodajKonto(@Body() body: KontoTestoweDto, @CurrentUser() actor: { userId: string }) {
    const email = body.email.trim().toLowerCase();
    const u = await this.prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true } });
    if (!u) throw new NotFoundException(`Nie ma konta z adresem ${email} – konto testowe musi już istnieć w Verris.`);
    const konf = await this.konfiguracjaMarki.konfiguracja();
    if (konf.kontaTestowe.includes(email) || konf.kontaTestowe.includes(u.id.toLowerCase())) {
      throw new ConflictException('To konto jest już na liście kont testowych Kreatora marki.');
    }
    const nowa = odczytajKonfiguracjeMarki(JSON.stringify({ ...konf, kontaTestowe: [...konf.kontaTestowe, email] }));
    if (!nowa.kontaTestowe.includes(email)) throw new BadRequestException('Lista kont testowych jest pełna (200) – usuń nieużywane wpisy.');
    await this.konfiguracjaMarki.zapisz(nowa, actor.userId, { kontoTestoweDodane: u.id });
    return this.konfiguracja();
  }

  @Delete('konta-testowe/:wpis')
  async usunKonto(@Param('wpis') wpis: string, @CurrentUser() actor: { userId: string }) {
    const klucz = wpis.trim().toLowerCase();
    const konf = await this.konfiguracjaMarki.konfiguracja();
    if (!konf.kontaTestowe.includes(klucz)) throw new NotFoundException('Tego wpisu nie ma na liście kont testowych Kreatora marki.');
    await this.konfiguracjaMarki.zapisz({ ...konf, kontaTestowe: konf.kontaTestowe.filter((k) => k !== klucz) }, actor.userId, { kontoTestoweUsuniete: true });
    return this.konfiguracja();
  }
}
