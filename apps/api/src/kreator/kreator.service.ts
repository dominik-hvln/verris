import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KreatorStatus, KreatorZrodloWersji, Prisma, type KreatorStrona } from '@verris/database';
import {
  Firma,
  KATALOG_EFEKTOW,
  KATALOG_WARIANTOW,
  KORZYSCI_PRO,
  PLANY_KREATORA,
  SEKCJE_PRO,
  WERSJA_MODELU,
  dopasujDoPlanu,
  migrujModel,
  walidujStrone,
  wszystkieSekcje,
  type BriefStrony,
  type FunkcjeAiKreatora,
  type KierunekProjektu,
  type Strona,
  type WersjaKreatora,
  type WiadomoscAi,
  type ZapytanieAi,
} from '@verris/kreator';
import { PrismaService } from '../prisma/prisma.service.js';
import { AiProviderService, type WynikAiZCache } from '../ai/ai-provider.service.js';
import {
  FUNKCJA_AI_KREATORA,
  KLUCZ_KONFIGURACJI_KREATORA,
  kontoTestowe,
  miesiacUtc,
  odczytajKonfiguracjeKreatora,
  type KonfiguracjaKreatora,
} from './konfiguracja.js';
import { wersjaKreatora } from './wersja-kreatora.js';
import { stanKreatoraPro } from './kreator-pro.js';
import { FUNKCJE_AI_KREATORA, RENDERER_KREATORA, type RendererKreatora } from './zaleznosci.js';
import { naglowkiPodgladu, zlozPodglad } from './podglad.js';
import { idZasobow, uzupelnijWymiary } from './zasoby-model.js';
import { adresBazowyZasobu } from './zasoby-token.js';
import type { BriefStronyDto } from './dto/kreator.dto.js';

/** Najwyżej tyle wersji na stronę; nadmiar = najstarsze wersje RECZNE (zapisy z edytora). */
export const LIMIT_WERSJI = 200;
/** Zmiana sekcji przez AI jest krótka – dłużej niż tyle nie trzymamy żądania klienta. */
export const TIMEOUT_ZMIANY_MS = 90_000;
/** Jedno wywołanie generacji (cała strona) – limit czasu żądania do Anthropic. */
export const TIMEOUT_GENERACJI_MS = 180_000;
/**
 * Generacja dłuższa niż tyle = przerwana (np. restart API w trakcie zadania w tle). Pro: pierwszy kierunek
 * z naprawą (2 × 180 s), potem pozostałe równolegle (2 × 180 s) – 12 min w najgorszym razie.
 */
export const GENEROWANIE_PRZERWANE_MS = 20 * 60_000;

const POWOD_TESTY = 'Verris Kreator jest jeszcze w testach – wkrótce będzie dostępny na każdym koncie z hostingiem.';
const POWOD_BRAK_HOSTINGU =
  'Verris Kreator jest dostępny dla kont z hostingiem Verris, także w okresie próbnym. Zamów hosting, żeby zbudować stronę.';
const BLAD_GENERACJI = 'Nie udało się wygenerować strony – spróbuj ponownie albo opisz firmę trochę inaczej.';
const BLAD_PRZERWANE = 'Generowanie zostało przerwane – spróbuj ponownie.';
const BLAD_AI = 'Kreator AI jest chwilowo niedostępny – spróbuj ponownie za chwilę.';
const NIE_MA_STRONY = 'Nie znaleziono strony.';

type PoleLimitu = 'generacje' | 'zmiany';
type Dostep = { dostep: true; wersja: WersjaKreatora; konf: KonfiguracjaKreatora } | { dostep: false; powod: string; wersja: WersjaKreatora | null; konf: KonfiguracjaKreatora };
type RekordStrony = KreatorStrona;

/** Suma zużycia wywołań AI jednej operacji (do KreatorZuzycie). */
export interface LicznikAi {
  wej: number;
  wyj: number;
  cacheZapis: number;
  cacheOdczyt: number;
  kosztUsd: number;
}
const nowyLicznik = (): LicznikAi => ({ wej: 0, wyj: 0, cacheZapis: 0, cacheOdczyt: 0, kosztUsd: 0 });

export interface ZadanieGeneracji {
  stronaId: string;
  userId: string;
  actorUserId: string;
  brief: BriefStrony;
  wersja: WersjaKreatora;
  /** Miesiąc, w którym zarezerwowano generację (zwolnienie przy błędzie). */
  miesiac: string;
}

/**
 * Verris Kreator – strony klienta (paczka 119). Model strony (@verris/kreator) jest jedynym źródłem prawdy;
 * AI (Anthropic z prompt caching) generuje i zmienia model, renderer robi z niego HTML. Limity per wersja
 * (PLANY_KREATORA) liczone w KreatorZuzycie; generacja i zmiana są REZERWOWANE atomowo przed wywołaniem AI
 * i zwalniane, gdy AI zawiedzie – klient nie traci limitu na naszym błędzie, a dwa równoległe żądania nie
 * przekroczą limitu.
 */
@Injectable()
export class KreatorService {
  private readonly logger = new Logger(KreatorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: AiProviderService,
    private readonly config: ConfigService,
    @Inject(FUNKCJE_AI_KREATORA) private readonly ai: FunkcjeAiKreatora,
    @Inject(RENDERER_KREATORA) private readonly renderer: RendererKreatora,
  ) {}

  // ---------------------------------------------------------------------------
  // Konfiguracja i dostęp
  // ---------------------------------------------------------------------------

  async konfiguracja(): Promise<KonfiguracjaKreatora> {
    const row = await this.prisma.platformSetting.findUnique({ where: { key: KLUCZ_KONFIGURACJI_KREATORA } }).catch(() => null);
    return odczytajKonfiguracjeKreatora(row?.value);
  }

  async dostep(userId: string): Promise<Dostep> {
    const konf = await this.konfiguracja();
    if (!konf.wlaczony) {
      const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
      if (!kontoTestowe(konf, { id: userId, email: u?.email })) return { dostep: false, powod: POWOD_TESTY, wersja: null, konf };
    }
    const wersja = await wersjaKreatora(this.prisma, userId);
    if (!wersja) return { dostep: false, powod: POWOD_BRAK_HOSTINGU, wersja: null, konf };
    return { dostep: true, wersja, konf };
  }

  private async wymagajDostepu(userId: string): Promise<{ wersja: WersjaKreatora; konf: KonfiguracjaKreatora }> {
    const d = await this.dostep(userId);
    if (!d.dostep) throw new ForbiddenException(d.powod);
    return d;
  }

  /** GET /kreator/stan – dostęp, wersja, plan, zużycie miesiąca i katalog do edytora (elementy Pro z flagą). */
  async stan(userId: string) {
    const d = await this.dostep(userId);
    const miesiac = miesiacUtc();
    const [zuzycie, stron, pro] = await Promise.all([
      this.prisma.kreatorZuzycie.findUnique({ where: { userId_miesiac: { userId, miesiac } } }),
      this.prisma.kreatorStrona.count({ where: { userId } }),
      stanKreatoraPro(this.prisma, userId),
    ]);
    const plan = d.wersja ? PLANY_KREATORA[d.wersja] : null;
    return {
      dostep: d.dostep,
      powod: d.dostep ? null : d.powod,
      wersja: d.wersja,
      plan,
      zuzycie: {
        miesiac,
        generacje: zuzycie?.generacje ?? 0,
        zmiany: zuzycie?.zmiany ?? 0,
        stron,
      },
      korzysciPro: KORZYSCI_PRO,
      // Paczka 121 – cennik z planu KREATOR_PRO w bazie (netto jak na fakturze), zakup i bieżący abonament.
      cenaPro: pro.cena,
      pro,
      katalog: { warianty: KATALOG_WARIANTOW, efekty: KATALOG_EFEKTOW, sekcjePro: SEKCJE_PRO },
    };
  }

  // ---------------------------------------------------------------------------
  // Strony
  // ---------------------------------------------------------------------------

  async lista(userId: string) {
    await this.wymagajDostepu(userId);
    await this.oznaczPrzerwane(userId);
    const strony = await this.prisma.kreatorStrona.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true, nazwa: true, status: true, bladOpis: true, branza: true, opublikowanaAt: true, domena: true,
        propozycje: true, createdAt: true, updatedAt: true,
      },
    });
    return strony.map(({ propozycje, ...s }) => ({ ...s, propozycji: Array.isArray(propozycje) ? propozycje.length : 0 }));
  }

  async pobierz(userId: string, id: string) {
    const { wersja } = await this.wymagajDostepu(userId);
    await this.oznaczPrzerwane(userId);
    return this.widok(await this.wlasna(userId, id), wersja);
  }

  /** POST /kreator/strony – limity sprawdzone i generacja zarezerwowana PRZED wywołaniem AI; AI w tle. */
  async utworz(userId: string, actorUserId: string, dto: { nazwa: string; brief: BriefStronyDto }): Promise<{ id: string }> {
    const { wersja } = await this.wymagajDostepu(userId);
    const plan = PLANY_KREATORA[wersja];
    const brief = this.brief(dto.brief);

    const stron = await this.prisma.kreatorStrona.count({ where: { userId } });
    if (stron >= plan.stron) {
      throw new ForbiddenException(
        `W tej wersji kreatora możesz mieć najwyżej ${plan.stron} ${plan.stron === 1 ? 'stronę' : plan.stron < 5 ? 'strony' : 'stron'}. Usuń jedną z nich${wersja === 'pro' ? '' : ' albo przejdź na Kreator Pro'}.`,
      );
    }
    const miesiac = await this.rezerwuj(userId, 'generacje', plan.generacjiMies);
    if (!miesiac) {
      throw new ForbiddenException(
        `Wykorzystano miesięczny limit generacji stron (${plan.generacjiMies}). Odnowi się 1. dnia miesiąca – do tego czasu możesz zmieniać istniejące strony.`,
      );
    }
    let id: string;
    try {
      const s = await this.prisma.kreatorStrona.create({
        data: {
          userId,
          nazwa: dto.nazwa.trim(),
          model: {},
          wersjaModelu: WERSJA_MODELU,
          odcisk: '',
          branza: brief.firma?.branza?.trim() || null,
          status: KreatorStatus.GENEROWANIE,
        },
        select: { id: true },
      });
      id = s.id;
    } catch (e) {
      await this.zwolnij(userId, miesiac, 'generacje');
      throw e;
    }
    this.wTle(() => this.generuj({ stronaId: id, userId, actorUserId, brief, wersja, miesiac }));
    return { id };
  }

  /** Zadanie w tle: osobny tik pętli zdarzeń; każdy błąd kończy się statusem BLAD w `generuj`, nie wyjątkiem procesu. */
  protected wTle(zadanie: () => Promise<void>): void {
    setImmediate(() => {
      zadanie().catch((e: unknown) => this.logger.error(`Zadanie kreatora: ${e instanceof Error ? e.message : String(e)}`));
    });
  }

  /**
   * Generacja: kierunki projektu wybiera serwer (różnorodność względem ostatnich stron tej branży), każdy kierunek
   * to jedno wywołanie AI z jedną rundą naprawy po błędach walidacji. Pierwszy kierunek idzie sam (zapisuje cache
   * master promptu), pozostałe równolegle – czytają już z cache. Pierwsza poprawna propozycja = model strony,
   * reszta (Kreator Pro) czeka w `propozycje`. Żadna poprawna → BLAD i zwrot rezerwacji generacji.
   */
  async generuj(z: ZadanieGeneracji): Promise<void> {
    const licznik = nowyLicznik();
    try {
      const konf = await this.konfiguracja();
      const plan = PLANY_KREATORA[z.wersja];
      const branza = z.brief.firma?.branza?.trim();
      const odciski = branza
        ? (
            await this.prisma.kreatorStrona.findMany({
              where: { branza, id: { not: z.stronaId }, odcisk: { not: '' } },
              orderBy: { createdAt: 'desc' },
              take: 30,
              select: { odcisk: true },
            })
          ).map((s) => s.odcisk)
        : [];
      const kierunki = this.ai.wybierzKierunki(z.brief, plan.wariantyGeneracji, odciski, undefined, z.wersja);
      if (!kierunki.length) throw new Error('Brak kierunków projektu.');
      const jeden = (k: KierunekProjektu) => this.generujKierunek(z, k, konf.modelGeneracji, licznik);
      const pierwszy = await jeden(kierunki[0]);
      const reszta = await Promise.all(kierunki.slice(1).map(jeden));
      const strony = [pierwszy, ...reszta].filter((s): s is Strona => s !== null);

      if (!strony.length) {
        await this.zakonczBledem(z, BLAD_GENERACJI);
        return;
      }
      const [model, ...propozycje] = strony;
      const zapisano = await this.zapiszModel(z.stronaId, model, KreatorZrodloWersji.AI_GENERACJA, 'Strona wygenerowana przez AI', {
        tylkoGdyGenerowanie: true,
        propozycje: propozycje.length ? propozycje : null,
      });
      if (zapisano === null) await this.zwolnij(z.userId, z.miesiac, 'generacje'); // strona usunięta w trakcie
    } catch (e) {
      this.logger.error(`Generacja strony ${z.stronaId}: ${e instanceof Error ? e.message : String(e)}`);
      await this.zakonczBledem(z, BLAD_GENERACJI).catch(() => undefined);
    } finally {
      await this.dolicz(z.userId, licznik).catch((e: unknown) => this.logger.error(`Zużycie kreatora: ${String(e)}`));
    }
  }

  private async generujKierunek(z: ZadanieGeneracji, k: KierunekProjektu, model: string, licznik: LicznikAi): Promise<Strona | null> {
    try {
      const zap = this.ai.budujZapytanieGeneracji(z.brief, z.wersja, k);
      const r = await this.wywolaj(zap, zap.wiadomosci, model, z, licznik, TIMEOUT_GENERACJI_MS);
      const w = this.ai.odczytajWynikGeneracji(r.wynik, z.wersja, z.brief);
      if (w.ok) return w.strona;
      const r2 = await this.wywolaj(zap, [...zap.wiadomosci, ...this.ai.wiadomosciNaprawy(r.wynik, w.bledy)], model, z, licznik, TIMEOUT_GENERACJI_MS);
      const w2 = this.ai.odczytajWynikGeneracji(r2.wynik, z.wersja, z.brief);
      if (w2.ok) return w2.strona;
      this.logger.warn(`Generacja ${z.stronaId} (${k.styl}) po naprawie nadal z błędami: ${w2.bledy.slice(0, 5).join('; ')}`);
      return null;
    } catch (e) {
      this.logger.warn(`Generacja ${z.stronaId} (${k.styl}): ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }

  private async wywolaj(
    zap: ZapytanieAi,
    wiadomosci: WiadomoscAi[],
    model: string,
    kto: { userId: string; actorUserId: string },
    licznik: LicznikAi,
    timeoutMs: number,
  ): Promise<WynikAiZCache> {
    const r = await this.provider.anthropicZBlokami({
      model,
      system: zap.system,
      wiadomosci,
      maxTokens: zap.maxTokens,
      funkcja: FUNKCJA_AI_KREATORA,
      userId: kto.userId,
      actorUserId: kto.actorUserId,
      rodzaj: zap.rodzaj,
      timeoutMs,
    });
    licznik.wej += r.wej;
    licznik.wyj += r.wyj;
    licznik.cacheZapis += r.zapis5m + r.zapis1h;
    licznik.cacheOdczyt += r.odczyt;
    licznik.kosztUsd += r.kosztUsd;
    return r;
  }

  private async zakonczBledem(z: ZadanieGeneracji, opis: string): Promise<void> {
    const r = await this.prisma.kreatorStrona.updateMany({
      where: { id: z.stronaId, status: KreatorStatus.GENEROWANIE },
      data: { status: KreatorStatus.BLAD, bladOpis: opis },
    });
    // Zwrot tylko raz: drugi przebieg (np. strażnik przerwanych) nie znajdzie już statusu GENEROWANIE.
    if (r.count) await this.zwolnij(z.userId, z.miesiac, 'generacje');
  }

  /** Generacje bez końca (restart API w trakcie zadania) → BLAD i zwrot rezerwacji z miesiąca utworzenia. */
  private async oznaczPrzerwane(userId: string): Promise<void> {
    const stare = await this.prisma.kreatorStrona.findMany({
      where: { userId, status: KreatorStatus.GENEROWANIE, updatedAt: { lt: new Date(Date.now() - GENEROWANIE_PRZERWANE_MS) } },
      select: { id: true, createdAt: true },
    });
    for (const s of stare) {
      await this.zakonczBledem(
        { stronaId: s.id, userId, miesiac: miesiacUtc(s.createdAt), actorUserId: userId, brief: { opis: '', typ: 'inna' }, wersja: 'proba' },
        BLAD_PRZERWANE,
      );
    }
  }

  /** POST /kreator/strony/:id/propozycja/:n – wybór propozycji (1…n); dotychczasowy model wraca na jej miejsce. */
  async wybierzPropozycje(userId: string, id: string, n: number) {
    const { wersja } = await this.wymagajDostepu(userId);
    const s = await this.wlasna(userId, id);
    const propozycje = Array.isArray(s.propozycje) ? (s.propozycje as unknown[]) : [];
    if (!Number.isInteger(n) || n < 1 || n > propozycje.length) throw new NotFoundException('Nie ma takiej propozycji.');
    const w = walidujStrone(migrujModel(propozycje[n - 1]));
    if (!w.ok) throw new ConflictException('Ta propozycja jest nieaktualna – wygeneruj stronę ponownie.');
    const nowe = [...propozycje];
    nowe[n - 1] = s.model;
    await this.zapiszModel(id, w.strona, KreatorZrodloWersji.AI_GENERACJA, `Wybrano propozycję ${n}`, { propozycje: nowe });
    return this.widok(await this.wlasna(userId, id), wersja);
  }

  /** PUT /kreator/strony/:id – zapis z edytora. Elementy Pro wolno trzymać w modelu; publikacja je dopasuje. */
  async zapiszRecznie(userId: string, id: string, model: unknown) {
    const { wersja } = await this.wymagajDostepu(userId);
    const s = await this.wlasna(userId, id);
    if (s.status === KreatorStatus.GENEROWANIE) throw new ConflictException('Strona jest jeszcze generowana – poczekaj na koniec.');
    const w = walidujStrone(migrujModel(model));
    if (!w.ok) throw new BadRequestException({ message: 'Strona zawiera błędy – popraw zaznaczone pola.', bledy: w.bledy });
    await this.zapiszModel(id, await this.zZasobamiKonta(userId, w.strona), KreatorZrodloWersji.RECZNA, null);
    return this.widok(await this.wlasna(userId, id), wersja);
  }

  /** POST /kreator/strony/:id/ai – zmiana całej strony albo jednej sekcji poleceniem (synchronicznie, ≤ 90 s). */
  async zmienAi(userId: string, actorUserId: string, id: string, dto: { polecenie: string; sekcjaId?: string }) {
    const { wersja, konf } = await this.wymagajDostepu(userId);
    const s = await this.wlasna(userId, id);
    const strona = this.gotowyModel(s);
    const sekcjaId = dto.sekcjaId ?? null;
    if (sekcjaId && !wszystkieSekcje(strona).some((x) => x.id === sekcjaId)) throw new BadRequestException('Nie ma takiej sekcji na stronie.');
    const plan = PLANY_KREATORA[wersja];
    const miesiac = await this.rezerwuj(userId, 'zmiany', plan.zmianAiMies);
    if (!miesiac) {
      throw new ForbiddenException(`Wykorzystano miesięczny limit zmian AI (${plan.zmianAiMies}). Odnowi się 1. dnia miesiąca – do tego czasu możesz edytować stronę ręcznie.`);
    }
    const licznik = nowyLicznik();
    const kto = { userId, actorUserId };
    let zuzyta = false;
    try {
      const zap = this.ai.budujZapytanieZmiany(strona, dto.polecenie.trim(), sekcjaId, wersja);
      const r = await this.wywolaj(zap, zap.wiadomosci, konf.modelZmian, kto, licznik, TIMEOUT_ZMIANY_MS).catch((e: unknown) => {
        throw this.bladAi(e);
      });
      let w = this.ai.odczytajWynikZmiany(strona, r.wynik, sekcjaId, wersja);
      if (!w.ok) {
        const wiad = [...zap.wiadomosci, ...this.ai.wiadomosciNaprawy(r.wynik, w.bledy)];
        const r2 = await this.wywolaj(zap, wiad, konf.modelZmian, kto, licznik, TIMEOUT_ZMIANY_MS).catch((e: unknown) => {
          throw this.bladAi(e);
        });
        w = this.ai.odczytajWynikZmiany(strona, r2.wynik, sekcjaId, wersja);
      }
      if (!w.ok) throw new UnprocessableEntityException('AI nie zdołało wprowadzić tej zmiany – opisz ją inaczej albo popraw sekcję ręcznie.');
      await this.zapiszModel(id, await this.zZasobamiKonta(userId, w.strona), KreatorZrodloWersji.AI_ZMIANA, dto.polecenie.trim().slice(0, 200));
      zuzyta = true;
      return this.widok(await this.wlasna(userId, id), wersja);
    } catch (e) {
      throw e instanceof HttpException ? e : this.bladAi(e);
    } finally {
      if (!zuzyta) await this.zwolnij(userId, miesiac, 'zmiany').catch(() => undefined);
      await this.dolicz(userId, licznik).catch((e: unknown) => this.logger.error(`Zużycie kreatora: ${String(e)}`));
    }
  }

  /** Błąd dostawcy AI → polski komunikat bez szczegółów dostawcy (white label); szczegóły w logu i AiInteractionLog. */
  private bladAi(e: unknown): HttpException {
    this.logger.warn(`Kreator AI: ${e instanceof Error ? e.message : String(e)}`);
    return new ServiceUnavailableException(BLAD_AI);
  }

  async wersje(userId: string, id: string) {
    await this.wymagajDostepu(userId);
    await this.wlasna(userId, id);
    return this.prisma.kreatorWersja.findMany({
      where: { stronaId: id },
      orderBy: { numer: 'desc' },
      select: { numer: true, zrodlo: true, opis: true, createdAt: true },
    });
  }

  async przywroc(userId: string, id: string, numer: number) {
    const { wersja } = await this.wymagajDostepu(userId);
    const s = await this.wlasna(userId, id);
    if (s.status === KreatorStatus.GENEROWANIE) throw new ConflictException('Strona jest jeszcze generowana – poczekaj na koniec.');
    const v = await this.prisma.kreatorWersja.findFirst({ where: { stronaId: id, numer }, select: { model: true } });
    if (!v) throw new NotFoundException('Nie ma takiej wersji.');
    const w = walidujStrone(migrujModel(v.model));
    if (!w.ok) throw new ConflictException('Tej wersji nie da się przywrócić – zapisano ją w starszym formacie.');
    await this.zapiszModel(id, w.strona, KreatorZrodloWersji.PRZYWROCENIE, `Przywrócono wersję ${numer}`);
    return this.widok(await this.wlasna(userId, id), wersja);
  }

  /** GET /kreator/strony/:id/podglad – HTML z rendererem w trybie podglądu, CSS i JS inline. */
  async podglad(userId: string, id: string, q: { podstrona?: string; pro?: string }) {
    const { wersja } = await this.wymagajDostepu(userId);
    const strona = this.gotowyModel(await this.wlasna(userId, id));
    const podstrona = q.podstrona ?? '';
    if (!strona.strony.some((p) => p.slug === podstrona)) throw new NotFoundException('Nie ma takiej podstrony.');
    const bazaFontow = `${this.publicznyAdresApi()}/fonts/kreator`;
    const pliki = await this.renderer.renderuj(strona, { tryb: 'podglad', wersja, podgladPro: q.pro === '1', bazaFontow, ...this.adresZasobu(strona) });
    const html = zlozPodglad(pliki, podstrona);
    if (html === null) throw new NotFoundException('Nie ma takiej podstrony.');
    return { html, naglowki: naglowkiPodgladu(bazaFontow) };
  }

  /** PATCH /kreator/strony/:id { nazwa } – zmiana nazwy na liście; dostęp jak zapis (PUT), tylko własna strona. */
  async zmienNazwe(userId: string, id: string, nazwa: string): Promise<{ id: string; nazwa: string }> {
    await this.wymagajDostepu(userId);
    const czysta = nazwa.replace(/\s+/g, ' ').trim();
    if (!czysta || czysta.length > 80) throw new BadRequestException('Nazwa strony: od 1 do 80 znaków.');
    const r = await this.prisma.kreatorStrona.updateMany({ where: { id, userId }, data: { nazwa: czysta } });
    if (!r.count) throw new NotFoundException(NIE_MA_STRONY);
    return { id, nazwa: czysta };
  }

  /** Usunięcie bez sprawdzania wersji kreatora: klient bez hostingu też może sprzątnąć swoje dane. */
  async usun(userId: string, id: string): Promise<{ ok: true }> {
    const r = await this.prisma.kreatorStrona.deleteMany({ where: { id, userId } });
    if (!r.count) throw new NotFoundException(NIE_MA_STRONY);
    return { ok: true };
  }

  // ---------------------------------------------------------------------------
  // Zapis modelu, wersje, zużycie
  // ---------------------------------------------------------------------------

  /**
   * Nowy model strony + wersja (numer = ostatni + 1) w jednej transakcji, potem przycięcie do LIMIT_WERSJI
   * (najstarsze RECZNE). `tylkoGdyGenerowanie` – zapis wyniku zadania w tle tylko, jeśli strona wciąż czeka
   * (usunięta albo oznaczona jako przerwana → null, nic nie zapisujemy). Zwraca numer wersji.
   */
  async zapiszModel(
    stronaId: string,
    strona: Strona,
    zrodlo: KreatorZrodloWersji,
    opis: string | null,
    opcje: { tylkoGdyGenerowanie?: boolean; propozycje?: unknown[] | null } = {},
  ): Promise<number | null> {
    const model = strona as unknown as Prisma.InputJsonValue;
    const odcisk = this.ai.odciskStrony(strona);
    for (let proba = 0; ; proba++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const zmiana = await tx.kreatorStrona.updateMany({
            where: { id: stronaId, ...(opcje.tylkoGdyGenerowanie ? { status: KreatorStatus.GENEROWANIE } : {}) },
            data: {
              model,
              wersjaModelu: WERSJA_MODELU,
              odcisk,
              branza: strona.firma.branza,
              status: KreatorStatus.GOTOWA,
              bladOpis: null,
              ...(opcje.propozycje !== undefined
                ? { propozycje: opcje.propozycje === null ? Prisma.DbNull : (opcje.propozycje as Prisma.InputJsonValue) }
                : {}),
            },
          });
          if (!zmiana.count) return null;
          const max = await tx.kreatorWersja.aggregate({ where: { stronaId }, _max: { numer: true } });
          const numer = (max._max.numer ?? 0) + 1;
          await tx.kreatorWersja.create({ data: { stronaId, numer, model, zrodlo, opis } });
          const liczba = await tx.kreatorWersja.count({ where: { stronaId } });
          if (liczba > LIMIT_WERSJI) {
            const najstarsze = await tx.kreatorWersja.findMany({
              where: { stronaId, zrodlo: KreatorZrodloWersji.RECZNA, numer: { not: numer } },
              orderBy: { numer: 'asc' },
              take: liczba - LIMIT_WERSJI,
              select: { id: true },
            });
            if (najstarsze.length) await tx.kreatorWersja.deleteMany({ where: { id: { in: najstarsze.map((v) => v.id) } } });
          }
          return numer;
        });
      } catch (e) {
        // Dwa równoległe zapisy wzięły ten sam numer (unikalny stronaId+numer) – drugi próbuje jeszcze raz.
        if (proba < 2 && e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') continue;
        throw e;
      }
    }
  }

  /** Atomowa rezerwacja jednej generacji/zmiany w miesiącu; null = limit wyczerpany. */
  async rezerwuj(userId: string, pole: PoleLimitu, limit: number): Promise<string | null> {
    const miesiac = miesiacUtc();
    await this.wierszZuzycia(userId, miesiac);
    const r = await this.prisma.kreatorZuzycie.updateMany({
      where: { userId, miesiac, [pole]: { lt: limit } },
      data: { [pole]: { increment: 1 } },
    });
    return r.count ? miesiac : null;
  }

  async zwolnij(userId: string, miesiac: string, pole: PoleLimitu): Promise<void> {
    await this.prisma.kreatorZuzycie.updateMany({
      where: { userId, miesiac, [pole]: { gt: 0 } },
      data: { [pole]: { decrement: 1 } },
    });
  }

  /** Tokeny i koszt AI (także nieudanych prób) – w bieżącym miesiącu. */
  async dolicz(userId: string, l: LicznikAi): Promise<void> {
    if (!l.wej && !l.wyj && !l.cacheZapis && !l.cacheOdczyt && !l.kosztUsd) return;
    const miesiac = miesiacUtc();
    await this.wierszZuzycia(userId, miesiac);
    await this.prisma.kreatorZuzycie.update({
      where: { userId_miesiac: { userId, miesiac } },
      data: {
        wejTokeny: { increment: l.wej },
        wyjTokeny: { increment: l.wyj },
        cacheZapis: { increment: l.cacheZapis },
        cacheOdczyt: { increment: l.cacheOdczyt },
        kosztUsd: { increment: new Prisma.Decimal(l.kosztUsd.toFixed(6)) },
      },
    });
  }

  private async wierszZuzycia(userId: string, miesiac: string): Promise<void> {
    try {
      await this.prisma.kreatorZuzycie.upsert({
        where: { userId_miesiac: { userId, miesiac } },
        create: { userId, miesiac },
        update: {},
      });
    } catch (e) {
      // Wyścig dwóch pierwszych operacji w miesiącu: wiersz już wstawił drugi proces – to nie błąd.
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
    }
  }

  // ---------------------------------------------------------------------------
  // Pomocnicze
  // ---------------------------------------------------------------------------

  private async wlasna(userId: string, id: string): Promise<RekordStrony> {
    const s = await this.prisma.kreatorStrona.findFirst({ where: { id, userId } });
    if (!s) throw new NotFoundException(NIE_MA_STRONY);
    return s;
  }

  private gotowyModel(s: RekordStrony): Strona {
    if (s.status === KreatorStatus.GENEROWANIE) throw new ConflictException('Strona jest jeszcze generowana – poczekaj na koniec.');
    const w = walidujStrone(migrujModel(s.model));
    if (!w.ok) throw new ConflictException('Strona nie jest jeszcze gotowa – wygeneruj ją ponownie.');
    return w.strona;
  }

  private widok(s: RekordStrony, wersja: WersjaKreatora) {
    const w = s.status === KreatorStatus.GENEROWANIE ? null : walidujStrone(migrujModel(s.model));
    return {
      id: s.id,
      nazwa: s.nazwa,
      status: s.status,
      bladOpis: s.bladOpis,
      branza: s.branza,
      model: w?.ok ? w.strona : null,
      propozycje: Array.isArray(s.propozycje) ? s.propozycje : [],
      /** Co zmieni publikacja bez Kreatora Pro (edytor pokazuje to jako „co tracisz bez Pro”). */
      zmianyBezPro: w?.ok && wersja !== 'pro' ? dopasujDoPlanu(w.strona, wersja).zmiany : [],
      opublikowanaAt: s.opublikowanaAt,
      domena: s.domena,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    };
  }

  /** Brief z formularza → BriefStrony; dane firmy przez schemat Firma (zod) z @verris/kreator, częściowo. */
  private brief(dto: BriefStronyDto): BriefStrony {
    let firma: BriefStrony['firma'];
    if (dto.firma) {
      const w = Firma.partial().safeParse(dto.firma);
      if (!w.success) {
        throw new BadRequestException({
          message: 'Dane firmy zawierają błędy.',
          bledy: w.error.issues.slice(0, 20).map((i) => `firma.${i.path.join('.')}: ${i.message}`),
        });
      }
      // Tylko pola podane przez klienta – bez wartości domyślnych schematu (np. typSchema), których nie wybrał.
      firma = Object.fromEntries(Object.entries(w.data).filter(([k]) => k in dto.firma!)) as BriefStrony['firma'];
    }
    return {
      opis: dto.opis.trim(),
      typ: dto.typ,
      ...(firma ? { firma } : {}),
      ...(dto.ceny?.trim() ? { ceny: dto.ceny.trim() } : {}),
      ...(dto.ton?.trim() ? { ton: dto.ton.trim() } : {}),
      ...(dto.styl ? { styl: dto.styl } : {}),
      ...(dto.inspiracje?.trim() ? { inspiracje: dto.inspiracje.trim() } : {}),
    };
  }

  /**
   * Paczka 122 – zdjęcia z biblioteki w modelu (Obraz.zasobId) muszą należeć do konta strony: cudzy albo usunięty
   * zasób = 400 (także po zmianie AI). Wymiary oryginałów wpisujemy z bazy – renderer liczy z nich srcset.
   */
  async zZasobamiKonta(userId: string, strona: Strona): Promise<Strona> {
    const ids = idZasobow(strona);
    if (!ids.length) return strona;
    const zasoby = await this.prisma.kreatorZasob.findMany({ where: { userId, id: { in: ids } }, select: { id: true, szerokosc: true, wysokosc: true } });
    return uzupelnijWymiary(strona, zasoby);
  }

  /** Podgląd: podpisane adresy plików zdjęć w API (ramka bez ciasteczek); bez klucza aplikacji – ramki zastępcze. */
  private adresZasobu(strona: Strona): { adresZasobu?: (id: string, s: number, f: 'webp' | 'jpg') => string } {
    const klucz = this.config.get<string>('appKmsKey');
    if (!klucz || !idZasobow(strona).length) return {};
    const api = this.publicznyAdresApi();
    return { adresZasobu: (id, s, f) => `${adresBazowyZasobu(api, klucz, id)}${s}.${f}` };
  }

  private publicznyAdresApi(): string {
    return (this.config.get<string>('PUBLIC_API_URL') ?? this.config.get<string>('API_BASE_URL') ?? 'https://api.verris.pl').replace(/\/+$/, '');
  }
}
