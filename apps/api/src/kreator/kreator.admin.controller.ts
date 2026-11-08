import { BadRequestException, Body, ConflictException, Controller, Delete, Get, HttpCode, Inject, NotFoundException, Param, Post, Put, UseGuards } from '@nestjs/common';
import { LegalDocumentKind, Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { AuditService } from '../common/audit/audit.service.js';
import { AdminCustomerActions } from '../common/audit/audit.actions.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AiProviderService } from '../ai/ai-provider.service.js';
import { MNOZNIK_ZAPISU_CACHE, ZNANE_MODELE_AI, mnoznikOdczytuCache } from '../ai/ai-modele.js';
import { KLUCZ_KONFIGURACJI_KREATORA, miesiacUtc, odczytajKonfiguracjeKreatora, type KonfiguracjaKreatora } from './konfiguracja.js';
import { KonfiguracjaKreatoraDto } from './dto/kreator.dto.js';
import { KontoTestoweDto } from './dto/kreator-admin.dto.js';
import { KreatorService } from './kreator.service.js';
import { BIBLIOTEKA_ZDJEC } from './zasoby.service.js';
import { BibliotekaZdjec } from './biblioteka/biblioteka.js';
import { DOSTAWCY_ZDJEC, type NazwaDostawcy } from './biblioteka/dostawca.js';
import { podsumowanieKreatora } from './kreator.admin.podsumowanie.js';

/** Nazwy bibliotek zdjęć w adminie; Openverse działa bez klucza (tylko CC0 i domena publiczna). */
const BIBLIOTEKI: Record<NazwaDostawcy, { nazwa: string; wymagaKlucza: boolean }> = {
  pixabay: { nazwa: 'Pixabay', wymagaKlucza: true },
  openverse: { nazwa: 'Openverse', wymagaKlucza: false },
  pexels: { nazwa: 'Pexels', wymagaKlucza: true },
};

/** Regulamin opisuje kreator, gdy wymienia usługę z nazwy (projekt: docs/legal/drafts/DO_ZATWIERDZENIA_kreator-pro.md). */
export const REGULAMIN_Z_KREATOREM = /Verris\s+Kreator/i;

export const BLAD_MODELU = 'Nieznany model – wybierz model Anthropic z listy (ceny modeli są w Konfiguracji asystenta).';

/**
 * Verris Kreator – konfiguracja i podsumowanie (admin; te same strażniki co ai-ustawienia.admin.controller.ts).
 * Ekran: Admin → Wiedza i AI → Kreator stron (/settings/kreator, paczka 123). Modele tylko Anthropic, włącznik
 * dla wszystkich, konta testowe (dodawane po e-mailu istniejącego konta), biblioteki zdjęć (stan klucza jako
 * boolean – nigdy sam klucz), zużycie i koszty miesiąca.
 */
@Controller('admin/kreator')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class KreatorAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: AiProviderService,
    private readonly audit: AuditService,
    private readonly kreator: KreatorService,
    @Inject(BIBLIOTEKA_ZDJEC) private readonly biblioteka: BibliotekaZdjec,
  ) {}

  /** Modele do wyboru: znane modele Anthropic + modele claude-* dopisane z cenami w ustawieniach AI. */
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

  /** Wpisy listy testowej z informacją, czy konto istnieje (e-mail albo identyfikator konta). */
  private async konta(konf: KonfiguracjaKreatora) {
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

  private async zapiszKonfiguracje(konf: KonfiguracjaKreatora, actorUserId: string, zmiana: Record<string, unknown>) {
    const value = JSON.stringify(konf);
    await this.prisma.platformSetting.upsert({
      where: { key: KLUCZ_KONFIGURACJI_KREATORA },
      create: { key: KLUCZ_KONFIGURACJI_KREATORA, value, updatedByUserId: actorUserId },
      update: { value, updatedByUserId: actorUserId },
    });
    await this.audit.record({
      action: AdminCustomerActions.AI_SETTINGS_UPDATED,
      userId: actorUserId,
      actorUserId,
      details: { kreator: { ...konf, kontaTestowe: konf.kontaTestowe.length, ...zmiana } },
    });
  }

  @Get('konfiguracja')
  async konfiguracja() {
    const miesiac = miesiacUtc();
    const konfiguracja = await this.kreator.konfiguracja();
    const [suma, modele, konta, regulamin] = await Promise.all([
      this.prisma.kreatorZuzycie.aggregate({
        where: { miesiac },
        _sum: { generacje: true, zmiany: true, kosztUsd: true, cacheZapis: true, cacheOdczyt: true },
      }),
      this.modele(),
      this.konta(konfiguracja),
      this.prisma.legalDocument.findFirst({
        where: { kind: LegalDocumentKind.TERMS, locale: 'pl', isCurrent: true },
        select: { version: true, contentMarkdown: true },
      }),
    ]);
    const zKluczem = new Set(this.biblioteka.wlaczeni(DOSTAWCY_ZDJEC).map((d) => d.nazwa));
    return {
      konfiguracja,
      kluczAnthropic: Boolean(this.provider.klucz('anthropic')),
      /** Ostrzeżenie przy włączniku: obowiązujący Regulamin musi opisywać Verris Kreator, zanim dostaną go wszyscy. */
      regulamin: { wersja: regulamin?.version ?? null, wymieniaKreator: REGULAMIN_Z_KREATOREM.test(regulamin?.contentMarkdown ?? '') },
      modele,
      mnoznikiZapisuCache: MNOZNIK_ZAPISU_CACHE,
      konta,
      /** Stan bibliotek zdjęć: tylko informacja, czy klucz jest na serwerze – nigdy wartość klucza. */
      biblioteki: DOSTAWCY_ZDJEC.map((id) => ({ id, ...BIBLIOTEKI[id], gotowa: zKluczem.has(id) })),
      miesiac: {
        miesiac,
        generacje: suma._sum.generacje ?? 0,
        zmiany: suma._sum.zmiany ?? 0,
        kosztUsd: Number(suma._sum.kosztUsd ?? 0),
        cacheZapis: suma._sum.cacheZapis ?? 0,
        cacheOdczyt: suma._sum.cacheOdczyt ?? 0,
      },
    };
  }

  /**
   * Zapis przez tę samą walidację co odczyt (odczytajKonfiguracjeKreatora); pola pominięte zostają bez zmian.
   * Modele: tylko Anthropic z listy (znane albo dopisane z ceną w ustawieniach AI) – inaczej koszt liczyłby się
   * po cenie zapasowej.
   */
  @Put('konfiguracja')
  async zapisz(@Body() body: KonfiguracjaKreatoraDto, @CurrentUser() actor: { userId: string }) {
    const dozwolone = new Set((await this.modele()).map((m) => m.model));
    for (const m of [body.modelGeneracji, body.modelZmian]) if (m !== undefined && !dozwolone.has(m)) throw new BadRequestException(BLAD_MODELU);
    const konf = odczytajKonfiguracjeKreatora(JSON.stringify({ ...(await this.kreator.konfiguracja()), ...body }));
    await this.zapiszKonfiguracje(konf, actor.userId, {});
    return this.konfiguracja();
  }

  /** Konto testowe po adresie e-mail – tylko istniejące konto (literówka nie daje „cichego” braku dostępu). */
  @Post('konta-testowe')
  @HttpCode(200)
  async dodajKonto(@Body() body: KontoTestoweDto, @CurrentUser() actor: { userId: string }) {
    const email = body.email.trim().toLowerCase();
    const u = await this.prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true } });
    if (!u) throw new NotFoundException(`Nie ma konta z adresem ${email} – konto testowe musi już istnieć w Verris.`);
    const konf = await this.kreator.konfiguracja();
    if (konf.kontaTestowe.includes(email) || konf.kontaTestowe.includes(u.id.toLowerCase())) {
      throw new ConflictException('To konto jest już na liście kont testowych.');
    }
    const nowa = odczytajKonfiguracjeKreatora(JSON.stringify({ ...konf, kontaTestowe: [...konf.kontaTestowe, email] }));
    if (!nowa.kontaTestowe.includes(email)) throw new BadRequestException('Lista kont testowych jest pełna (200) – usuń nieużywane wpisy.');
    await this.zapiszKonfiguracje(nowa, actor.userId, { kontoTestoweDodane: u.id });
    return this.konfiguracja();
  }

  @Delete('konta-testowe/:wpis')
  async usunKonto(@Param('wpis') wpis: string, @CurrentUser() actor: { userId: string }) {
    const klucz = wpis.trim().toLowerCase();
    const konf = await this.kreator.konfiguracja();
    if (!konf.kontaTestowe.includes(klucz)) throw new NotFoundException('Tego wpisu nie ma na liście kont testowych.');
    const nowa = { ...konf, kontaTestowe: konf.kontaTestowe.filter((k) => k !== klucz) };
    await this.zapiszKonfiguracje(nowa, actor.userId, { kontoTestoweUsuniete: true });
    return this.konfiguracja();
  }

  /** Zużycie i koszty miesiąca (UTC), Kreator Pro, wykres 30 dni i ostatnie błędy generacji – bez treści stron. */
  @Get('podsumowanie')
  async podsumowanie() {
    const { ceny } = await this.provider.konfiguracja();
    return podsumowanieKreatora(this.prisma, ceny);
  }
}
