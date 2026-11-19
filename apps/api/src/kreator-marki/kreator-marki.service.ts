import { randomInt, randomUUID } from 'node:crypto';
import { BadRequestException, HttpException, HttpStatus, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type KreatorMarka } from '@verris/database';
import {
  BriefMarki,
  DaneKontaktoweMarki,
  KierunekMarki,
  KOMUNIKAT_ZNANA_MARKA,
  MATERIALY_KV,
  ProjektLogo,
  RODZAJE_DROBNYCH,
  TYPY_ODSWIEZENIA,
  UKLADY_LOGO,
  UstawieniaKv,
  WARIANTY_KOLORU,
  WERSJA_MODELU_MARKI,
  budujZapytanieAnalizyLogo,
  budujZapytanieDrobnejZmiany,
  budujZapytanieKv,
  budujZapytanieOdswiezenia,
  budujZapytaniePonowienia,
  budujZapytanieSamooceny,
  budujZapytanieSerii,
  czyFontWKatalogu,
  doWymianySamoocena,
  KAFEL_SAMOOCENY,
  odczytajPonowienie,
  odczytajSamoocene,
  SIATKA_SAMOOCENY,
  STAWKI_HAIKU_45,
  STAWKI_SONNET_55,
  szacujKosztSamooceny,
  hexDoOklch,
  koloryLogoKv,
  krojTekstuDla,
  naprawaMarki,
  ocenProjekt,
  odciskParametrow,
  odciskSvg,
  odczytajAnalizeLogo,
  odczytajDrobnaZmiane,
  odczytajKv,
  odczytajOdswiezenie,
  odczytajSerie,
  podobienstwo,
  preselekcjaOdswiezenia,
  preselekcjaSerii,
  problemyPomiarow,
  rodzinaPoId,
  rysujSygnet,
  sprawdzBriefMarki,
  sprawdzPolecenieMarki,
  uzupelnijSerie,
  walidatorSymboluBiblioteki,
  zamiennikKierunku,
  type AnalizaLogo,
  type AnalizaWgranego,
  type DrobnaZmianaBody,
  type KierunekOdswiezenia,
  type KsztaltNapisu,
  type Marka,
  type MaterialKv,
  type ObecneLogo,
  type PomiaryLogo,
  type PozycjaListyMarek,
  type PreselekcjaMarki,
  type SeriaMarki,
  type StanKreatoraMarki,
  type Sygnet,
  type UkladLogo,
  type WariantKoloru,
  type WersjaKreatora,
  type WersjaMarkiKonta,
  type WiadomoscAi,
  type WidokMarki,
  type WybierzBody,
  type WynikSerii,
  type WynikZakupuMarki,
  type ZapytanieAiMarki,
  type ZgodyBody,
  type ZnakWydany,
  type StopkaEmailWynik,
  type SlotDoPonowienia,
} from '@verris/kreator';
import sharp from 'sharp';
import { pngZSvg } from './pliki-graficzne.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AiProviderService, OdpowiedzUcietaAiError, type WiadomoscAnthropic, type WynikAiZCache } from '../ai/ai-provider.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { KreatorMarkiActions } from '../common/audit/audit.actions.js';
import { ObjectStorageService } from '../storage/object-storage.service.js';
import { ObjectBuckets } from '../storage/object-storage.types.js';
import { wersjaKreatora } from '../kreator/wersja-kreatora.js';
import { kluczWariantu } from '../kreator/zasoby-obraz.js';
import { KonfiguracjaMarkiService } from './konfiguracja-marki.service.js';
import { cenyMarki, FUNKCJA_AI_MARKI, type KonfiguracjaMarki } from './konfiguracja-marki.js';
import { etapMarki, katalogPlikow, kluczBranzy, listaPlikow, odczytajDaneMarki, ukladyMarki, blokadaPliku, type AnalizaZapisana, type DaneMarki } from './dane-marki.js';
import { dolicz, dostepBezHostingu, nowyLicznikMarki, rezerwuj, stanLimitow, zwolnij, type LicznikAiMarki, type PoleLimituMarki, type RezerwacjaMarki } from './limity-marki.js';
import { NapisMarkiService } from './napis-marki.js';
import { GeneratorPlikowMarki, type KontekstPlikow, type WynikPliku } from './generator-plikow.js';
import { ZakupMarkiService } from './zakup-marki.js';
import { BladWgrania, rozpoznajTypWgranego, sygnetWKolorach, zmierzPlik, KOMUNIKAT_TYP } from './wgrywanie-marki.js';
import { utworzTokenMarki, sprawdzTokenMarki, type PlikPubliczny } from './token-marki.js';
import { INSTRUKCJE_STOPKI, USTAW_STOPKE_EMAIL, bladStopki, stopkaTekstowa, type UstawStopkeEmail } from './stopka-email.js';

/** Tożsamość z JWT: konto (właściciel) i osoba działająca (subkonto, impersonacja). */
export interface KtoMarki {
  userId: string;
  actorUserId: string;
}

/** Seria z 4 symbolami SVG + myślenie modelu – jak generacja w Kreatorze stron (TIMEOUT_GENERACJI_MS = 180 s). */
export const TIMEOUT_SERII_MS = 180_000;
/** Ponowienie slotów i samoocena – krótkie wywołania. */
export const TIMEOUT_PONOWIENIA_MS = 90_000;
/** Ponowienie slotów z symbolem AI, gdy odrzuconych jest WIĘCEJ niż 1 (paczka 134); jeden odrzucony – od razu monogram. */
export const PROG_PONOWIENIA = 2;
export const TIMEOUT_ZMIANY_MS = 60_000;
/** Podobieństwo odcisków rastra (pHash), od którego znak uznajemy za zbyt podobny do wydanego w branży [do weryfikacji progów na danych]. */
export const PROG_PODOBIENSTWA = 0.9;
const MAKS_SERII_W_WIDOKU = 20;

export const KOMUNIKATY = {
  modul: 'Kreator marki nie jest dostępny na tym koncie.',
  hosting: 'Kreator marki jest dostępny dla kont z hostingiem Verris, także w okresie próbnym. Zamów hosting, żeby zaprojektować markę.',
  brak: 'Nie znaleziono marki.',
  limitMarek: (n: number) => `Masz już ${n} ${n === 1 ? 'markę' : n < 5 ? 'marki' : 'marek'} na koncie – usuń jedną albo dokup kolejną markę.`,
  limitSerii: 'Wykorzystano limit serii propozycji. Limit w cenie hostingu odnowi się 1. dnia miesiąca – więcej serii daje Pakiet marki.',
  limitZmian: 'Wykorzystano limit zmian AI. Limit w cenie hostingu odnowi się 1. dnia miesiąca – więcej zmian daje Pakiet marki. Kolor, krój i układ zmienisz bez AI.',
  bezProjektu: 'Najpierw wybierz kierunek znaku.',
  podobny: 'Ten znak jest bardzo podobny do logo, które już powstało w Kreatorze marki. Wybierz inny kierunek albo zmień parametry znaku.',
  ai: 'Kreator AI jest chwilowo niedostępny – spróbuj ponownie za chwilę.',
  /** Paczka 134: przy całkowitej awarii AI seria nie powstaje (bez losowych szablonów), limit wraca. */
  aiSeria: 'Kreator AI jest chwilowo niedostępny – nie pokazujemy propozycji zastępczych i nie pobraliśmy limitu serii. Spróbuj ponownie za chwilę.',
  /** Seria zapisana przed paczką 134 z samych zamienników (AI nie odpowiedziało) – opis w panelu. */
  zapas: 'AI jest chwilowo niedostępne – pokazujemy propozycje zastępcze z biblioteki. Ta seria nie zużyła limitu. Spróbuj ponownie za chwilę.',
  proba: 'Pobieranie plików marki jest dostępne po opłaceniu hostingu – w okresie próbnym projektujesz markę i oglądasz podgląd.',
  pakiet: 'Ten plik jest w Pakiecie marki.',
  tmview: 'Przed pobraniem plików do druku potwierdź, że sprawdzono podobne znaki w bazie TMview.',
} as const;

const blad = (status: number, message: string, kod: string, extra: Record<string, unknown> = {}) => new HttpException({ message, kod, code: kod, ...extra }, status);

/** Odpowiedź ucięta limitem max_tokens nie idzie do rundy naprawy (jak kreator stron, paczka 127). */
const ucieta = (r: WynikAiZCache) => r.powodKonca === 'max_tokens';

const ROZPOZNAWALNOSC = { 3: 'wysoka', 2: 'średnia', 1: 'niska' } as const;

function zod<T>(schemat: { safeParse(v: unknown): { success: true; data: T } | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } } }, dane: unknown, komunikat: string): T {
  const w = schemat.safeParse(dane);
  if (w.success) return w.data;
  throw new BadRequestException({ message: komunikat, kod: 'NIEPOPRAWNE_DANE', code: 'NIEPOPRAWNE_DANE', bledy: w.error.issues.slice(0, 20).map((i) => `${i.path.map(String).join('.') || '(całość)'}: ${i.message}`) });
}

/** Znak wydany w branży (rejestr) → ZnakWydany do preselekcji (parametry odtworzone ze środka przedziału odcisku). */
export function znakZOdcisku(rodzina: string, odcisk: string | null): ZnakWydany {
  const r = rodzinaPoId(rodzina);
  if (!r || !odcisk) return { rodzina };
  const czesci = odcisk.split('|')[1] ?? '';
  const parametry: Record<string, number> = {};
  for (const para of czesci.split(';').filter(Boolean)) {
    const [k, q] = para.split('=');
    const p = r.parametry.find((x) => x.klucz === k);
    if (!p || q === undefined) continue;
    const zakres = p.max - p.min;
    parametry[p.klucz] = zakres <= 4 ? p.min + Number(q) : Math.round(p.min + ((Number(q) + 0.5) / 5) * zakres);
  }
  return { rodzina, parametry };
}

export interface OdciskZnaku {
  rodzina: string;
  odciskParametrow: string | null;
  pHash: string;
}

/** Odcisk znaku do rejestru (null – marka bez sygnetu: porównujemy tylko znaki). */
export function odciskZnaku(s: Sygnet, nazwa: string): OdciskZnaku | null {
  if (s.typ === 'brak') return null;
  const wnetrze = rysujSygnet(s, { nazwa });
  if (!wnetrze) return null;
  return {
    rodzina: s.typ === 'biblioteka' ? s.rodzina : s.typ,
    odciskParametrow: odciskParametrow(s),
    pHash: odciskSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${wnetrze}</svg>`),
  };
}

/** Zbyt podobny do któregoś z wydanych: ten sam przepis (rodzina + parametry + litery) albo pHash ≥ PROG_PODOBIENSTWA. */
export function zbytPodobny(o: OdciskZnaku | null, wydane: readonly { odciskParametrow: string | null; pHash: string }[]): boolean {
  if (!o) return false;
  return wydane.some((w) => (o.odciskParametrow && w.odciskParametrow === o.odciskParametrow) || podobienstwo(o.pHash, w.pHash) >= PROG_PODOBIENSTWA);
}

/** 'odczyt' – podgląd marki i pobieranie plików; 'zapis' – reszta (serie, zmiany AI, wgrywanie, stopka). */
export type TrybDostepu = 'zapis' | 'odczyt';

type Dostep = {
  konf: KonfiguracjaMarki;
  /** null – brak działającego hostingu (dostęp z Pakietu albo z progu eksportu, paczka 134). */
  wersjaKreatora: WersjaKreatora | null;
  /** Bez hostingu i Pakietu, próg eksportu spełniony: sam odczyt, pliki jak przy hostingu (bez KV i druku). */
  plikiJakHosting: boolean;
};

/**
 * Seria do widoku (paczka 134): `zrodlo` – 'zapas', gdy wszystkie kierunki to zamienniki serwera (serie zapisane przed
 * paczką 134 przy awarii AI – limit nie był pobrany), inaczej 'ai'. Przy 'zapas' panel pokazuje `komunikat`.
 */
export function seriaWidoku(s: { id: string; rodzaj: string; createdAt: Date; kierunki: unknown; strategia: unknown }): SeriaMarki {
  const kierunki = (Array.isArray(s.kierunki) ? s.kierunki : []) as SeriaMarki['kierunki'];
  const zapas = kierunki.length > 0 && kierunki.every((k) => k.zrodloZnaku === 'zamiennik');
  return {
    id: s.id,
    rodzaj: s.rodzaj as SeriaMarki['rodzaj'],
    utworzono: s.createdAt.toISOString(),
    kierunki,
    ...(s.strategia ? { strategia: s.strategia as SeriaMarki['strategia'] } : {}),
    zrodlo: zapas ? 'zapas' : 'ai',
    ...(zapas ? { komunikat: KOMUNIKATY.zapas } : {}),
  };
}


@Injectable()
export class KreatorMarkiService {
  private readonly logger = new Logger(KreatorMarkiService.name);
  readonly generator: GeneratorPlikowMarki;
  private readonly plikiPubliczne = new Map<string, Buffer>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: AiProviderService,
    private readonly konfiguracjaMarki: KonfiguracjaMarkiService,
    private readonly napis: NapisMarkiService,
    private readonly zakupy: ZakupMarkiService,
    private readonly audit: AuditService,
    private readonly storage: ObjectStorageService,
    private readonly config: ConfigService,
    @Inject(USTAW_STOPKE_EMAIL) private readonly stopka: UstawStopkeEmail,
  ) {
    this.generator = new GeneratorPlikowMarki(napis);
  }

  // ───────────────────────── dostęp ─────────────────────────

  /** Moduł włączony dla konta (admin) – inaczej 403 MODUL_NIEDOSTEPNY. */
  private async modul(userId: string): Promise<KonfiguracjaMarki> {
    if (!(await this.konfiguracjaMarki.dostep(userId))) throw blad(HttpStatus.FORBIDDEN, KOMUNIKATY.modul, 'MODUL_NIEDOSTEPNY');
    return this.konfiguracjaMarki.konfiguracja();
  }

  /**
   * Moduł + działający hosting (także próba – jak Kreator stron). Paczka 134 (decyzja 19.11 – wykupione pliki zawsze
   * dostępne): bez hostingu opłacony Pakiet marki daje pełny moduł (limity tylko z puli Pakietu), a konto bez Pakietu
   * z progiem eksportu (eksportOdblokowany) – sam odczyt i pobranie plików. Inaczej 403 BRAK_HOSTINGU.
   */
  async dostep(userId: string, tryb: TrybDostepu = 'zapis'): Promise<Dostep> {
    const konf = await this.modul(userId);
    const w = await wersjaKreatora(this.prisma, userId);
    if (w) return { konf, wersjaKreatora: w, plikiJakHosting: false };
    const bez = await dostepBezHostingu(this.prisma, userId);
    if (bez === 'pakiet') return { konf, wersjaKreatora: null, plikiJakHosting: false };
    if (bez === 'odczyt' && tryb === 'odczyt') return { konf, wersjaKreatora: null, plikiJakHosting: true };
    throw blad(HttpStatus.FORBIDDEN, KOMUNIKATY.hosting, 'BRAK_HOSTINGU');
  }

  /** Wersja do blokad plików: konto z samym progiem eksportu (bez hostingu i Pakietu) dostaje pliki jak przy hostingu. */
  private async wersjaPlikow(userId: string, konf: KonfiguracjaMarki, d: Pick<Dostep, 'wersjaKreatora' | 'plikiJakHosting'>): Promise<WersjaMarkiKonta> {
    const { wersja } = await stanLimitow(this.prisma, userId, konf, d.wersjaKreatora);
    return d.plikiJakHosting && wersja === 'proba' ? 'hosting' : wersja;
  }

  /** Dla dostawcy marki (Kreator stron, GET /kreator/stan.markaDostepna). */
  async dostepna(userId: string): Promise<boolean> {
    if (!(await this.konfiguracjaMarki.dostep(userId))) return false;
    return (await wersjaKreatora(this.prisma, userId)) !== null;
  }

  private async wlasna(userId: string, id: string): Promise<KreatorMarka> {
    // IDOR: marka wyłącznie z konta z tokenu; cudza i nieistniejąca – to samo 404
    const r = /^[0-9a-f-]{36}$/i.test(id) ? await this.prisma.kreatorMarka.findFirst({ where: { id, userId } }) : null;
    if (!r) throw new NotFoundException({ message: KOMUNIKATY.brak, kod: 'NIE_MA_MARKI' });
    return r;
  }

  // ───────────────────────── stan i lista ─────────────────────────

  async stan(userId: string): Promise<StanKreatoraMarki> {
    const konf = await this.modul(userId);
    const w = await wersjaKreatora(this.prisma, userId);
    // paczka 134: bez hostingu panel nie chowa marki przed kimś, kto ją wykupił albo może ją pobrać (próg eksportu)
    const bez = w === null ? await dostepBezHostingu(this.prisma, userId) : null;
    const limity = await stanLimitow(this.prisma, userId, konf, w);
    const ceny = cenyMarki(konf);
    const marki = await this.prisma.kreatorMarka.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' } });
    const lista: PozycjaListyMarek[] = [];
    for (const r of marki) {
      let miniaturaSvg: string | null = null;
      try {
        const d = odczytajDaneMarki(r.dane);
        if (d.marka) miniaturaSvg = (await this.generator.logo(d.marka, ukladyMarki(d.marka)[0]!, 'kolor', { metadane: false })).svg;
      } catch (e) {
        this.logger.warn(`Miniatura marki ${r.id}: ${String(e)}`);
      }
      lista.push({ id: r.id, nazwa: r.nazwa, zrodlo: r.zrodlo as PozycjaListyMarek['zrodlo'], etap: r.etap as PozycjaListyMarek['etap'], wersja: r.wersja, zaktualizowano: r.updatedAt.toISOString(), miniaturaSvg });
    }
    return {
      dostepny: w !== null || bez !== null,
      wersja: bez === 'odczyt' && limity.wersja === 'proba' ? 'hosting' : limity.wersja,
      limity: { marki: limity.marki, serie: limity.serie, zmianyAi: limity.zmianyAi },
      pakiet: {
        kupiony: limity.pakietKupiony,
        cena: ceny.pakiet,
        aktualizacjeDo: limity.aktualizacjeDo,
        zawiera: { serie: konf.pakiet.serie, zmianyAi: konf.pakiet.zmianyAi, aktualizacjeMies: konf.pakiet.aktualizacjeSzablonowMies },
      },
      drugaMarka: { cena: ceny.drugaMarka, dostepna: w !== null && w !== 'proba' },
      symboleAi: konf.symboleAi,
      maksWgraniaMb: konf.maksRozmiarWgraniaMb,
      marki: lista,
    };
  }

  // ───────────────────────── widok ─────────────────────────

  private async widok(r: KreatorMarka, wersjaKreatoraKonta?: WersjaKreatora | null, plikiJakHosting = false): Promise<WidokMarki> {
    const dane = odczytajDaneMarki(r.dane);
    const [serie, konf] = await Promise.all([
      this.prisma.kreatorMarkaSeria.findMany({ where: { markaId: r.id }, orderBy: { createdAt: 'desc' }, take: MAKS_SERII_W_WIDOKU }),
      this.konfiguracjaMarki.konfiguracja(),
    ]);
    const w = wersjaKreatoraKonta === undefined ? await wersjaKreatora(this.prisma, r.userId) : wersjaKreatoraKonta;
    const wersjaPlikow = await this.wersjaPlikow(r.userId, konf, { wersjaKreatora: w, plikiJakHosting });
    const strony = await this.prisma.$queryRaw<{ id: string; nazwa: string; wersja: number | null }[]>`
      SELECT "id", "nazwa", NULLIF("model"->'marka'->>'wersja', '')::int AS "wersja"
      FROM "KreatorStrona" WHERE "userId" = ${r.userId} AND "model"->'marka'->>'markaId' = ${r.id} ORDER BY "updatedAt" DESC LIMIT 50`;
    const m = dane.marka;
    const ocena = m ? ocenProjekt(m.projekt, m.brief.nazwa) : null;
    return {
      id: r.id,
      zrodlo: r.zrodlo as WidokMarki['zrodlo'],
      etap: r.etap as WidokMarki['etap'],
      wersja: r.wersja,
      brief: dane.brief,
      serie: serie.map((s) => seriaWidoku(s)),
      marka: m,
      ocena,
      ...(dane.analiza ? { analiza: await this.analizaWidoku(r.userId, dane.analiza) } : {}),
      pliki: listaPlikow(m, wersjaPlikow, !!(m?.zgody.sprawdzilemTmview ?? dane.zgody.sprawdzilemTmview)),
      strony: strony.map((s) => ({ id: s.id, nazwa: s.nazwa, wersjaNaStronie: s.wersja })),
    };
  }

  private async analizaWidoku(userId: string, a: AnalizaZapisana): Promise<AnalizaWgranego> {
    let oryginal = '';
    const plik = await this.prisma.kreatorMarkaPlik.findFirst({ where: { id: a.plikId, userId }, select: { kluczPodgladu: true } });
    if (plik?.kluczPodgladu) {
      try {
        oryginal = `data:image/png;base64,${(await this.storage.getObjectBuffer(ObjectBuckets.KREATOR_ZASOBY, plik.kluczPodgladu)).toString('base64')}`;
      } catch (e) {
        this.logger.warn(`Podgląd wgranego logo ${a.plikId}: ${String(e)}`);
      }
    }
    return {
      kolory: a.kolory,
      problemy: a.problemy,
      elementy: a.elementy,
      ...(a.krojPodobny ? { krojPodobny: a.krojPodobny } : {}),
      ...(a.wektorSvg ? { wektorSvg: sygnetWKolorach(a.wektorSvg, a.kolory.map((k) => k.hex)) } : {}),
      ...(a.zgodnosc !== undefined ? { zgodnosc: a.zgodnosc } : {}),
      oryginal,
    };
  }

  async pobierz(userId: string, id: string): Promise<WidokMarki> {
    const { wersjaKreatora: w, plikiJakHosting } = await this.dostep(userId, 'odczyt');
    return this.widok(await this.wlasna(userId, id), w, plikiJakHosting);
  }

  // ───────────────────────── marki ─────────────────────────

  private sprawdzBrief(brief: BriefMarki): void {
    const s = sprawdzBriefMarki(brief);
    if (!s.ok) throw blad(HttpStatus.UNPROCESSABLE_ENTITY, s.bledy[0]?.komunikat ?? 'Popraw opis firmy.', 'ZNANA_MARKA', { bledy: s.bledy.map((b) => `${b.pole}: ${b.komunikat}`) });
  }

  private async limitMarek(userId: string, konf: KonfiguracjaMarki, w: WersjaKreatora | null): Promise<void> {
    const l = await stanLimitow(this.prisma, userId, konf, w);
    if (l.marki.uzyte >= l.marki.limit) throw blad(HttpStatus.PAYMENT_REQUIRED, KOMUNIKATY.limitMarek(l.marki.uzyte), 'LIMIT_MAREK');
  }

  async utworz(kto: KtoMarki, body: unknown): Promise<WidokMarki> {
    const { konf, wersjaKreatora: w } = await this.dostep(kto.userId);
    const b = (body ?? {}) as { zrodlo?: unknown; brief?: unknown };
    if (b.zrodlo !== 'nowa') throw new BadRequestException({ message: 'Nową markę z briefu zakładasz ze źródłem „nowa” – logo wgrywasz przez „Mam logo”.', kod: 'ZLE_ZRODLO' });
    const brief = zod(BriefMarki, b.brief, 'Popraw opis firmy.');
    this.sprawdzBrief(brief);
    await this.limitMarek(kto.userId, konf, w);
    const dane: DaneMarki = { brief, marka: null, zgody: {} };
    const r = await this.prisma.kreatorMarka.create({ data: { userId: kto.userId, nazwa: brief.nazwa, zrodlo: 'nowa', etap: 'brief', dane: dane as unknown as Prisma.InputJsonValue } });
    await this.audit.record({ action: KreatorMarkiActions.KREATOR_MARKI_UTWORZONO, userId: kto.userId, actorUserId: kto.actorUserId, details: { markaId: r.id, zrodlo: 'nowa' } });
    return this.widok(r, w);
  }

  /** Zapis danych marki; `nowaWersja` – zmiana logo/kolorów/krojów (Kreator stron pokaże „marka się zmieniła”). */
  private async zapisz(r: KreatorMarka, dane: DaneMarki, o: { nowaWersja?: boolean } = {}): Promise<KreatorMarka> {
    const liczbaSerii = await this.prisma.kreatorMarkaSeria.count({ where: { markaId: r.id } });
    return this.prisma.kreatorMarka.update({
      where: { id: r.id },
      data: {
        dane: dane as unknown as Prisma.InputJsonValue,
        nazwa: dane.brief.nazwa,
        etap: etapMarki(dane, liczbaSerii),
        ...(o.nowaWersja ? { wersja: { increment: 1 } } : {}),
      },
    });
  }

  async zmienBrief(kto: KtoMarki, id: string, body: unknown): Promise<WidokMarki> {
    const { wersjaKreatora: w } = await this.dostep(kto.userId);
    const r = await this.wlasna(kto.userId, id);
    const brief = zod(BriefMarki, body, 'Popraw opis firmy.');
    this.sprawdzBrief(brief);
    const dane = odczytajDaneMarki(r.dane);
    dane.brief = brief;
    if (dane.marka) dane.marka = { ...dane.marka, brief };
    return this.widok(await this.zapisz(r, dane, { nowaWersja: !!dane.marka }), w);
  }

  async usun(kto: KtoMarki, id: string): Promise<void> {
    // bez wymogu hostingu i modułu (jak usunięcie strony w kreatorze) – klient zawsze może sprzątnąć swoje dane
    const r = await this.wlasna(kto.userId, id);
    const pliki = await this.prisma.kreatorMarkaPlik.findMany({ where: { markaId: r.id, userId: kto.userId }, select: { klucz: true, kluczPodgladu: true } });
    await this.prisma.$transaction([
      // rejestr wydanych znaków: wpis zostaje bez powiązań – wewnętrzny mechanizm ograniczania powtórzeń (bez obietnicy unikalności, decyzja 19.11)
      this.prisma.kreatorMarkaOdcisk.updateMany({ where: { markaId: r.id }, data: { userId: null, markaId: null } }),
      this.prisma.kreatorMarka.delete({ where: { id: r.id } }),
    ]);
    for (const k of pliki.flatMap((p) => [p.klucz, p.kluczPodgladu]).filter((x): x is string => !!x)) {
      await this.storage.removeObject(ObjectBuckets.KREATOR_ZASOBY, k).catch((e: unknown) => this.logger.warn(`Usunięcie pliku marki ${k}: ${String(e)}`));
    }
    await this.audit.record({ action: KreatorMarkiActions.KREATOR_MARKI_USUNIETO, userId: kto.userId, actorUserId: kto.actorUserId, details: { markaId: r.id } });
  }

  // ───────────────────────── AI ─────────────────────────

  private async wywolaj(zap: ZapytanieAiMarki, wiadomosci: WiadomoscAi[], konf: KonfiguracjaMarki, kto: KtoMarki, licznik: LicznikAiMarki, timeoutMs: number, obrazPng?: Buffer): Promise<WynikAiZCache> {
    const model = zap.klasaModelu === 'tani' ? konf.modelZmian : konf.modelGeneracji;
    const msgs: WiadomoscAnthropic[] = wiadomosci.map((w, i) =>
      i === 0 && w.role === 'user' && zap.obraz && obrazPng
        ? { role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: obrazPng.toString('base64') } }, { type: 'text', text: w.content }] }
        : w,
    );
    const r = await this.provider.anthropicZBlokami({
      model,
      system: zap.system,
      wiadomosci: msgs,
      maxTokens: zap.maxTokens,
      funkcja: FUNKCJA_AI_MARKI,
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

  /** Wywołanie z jedną rundą naprawy (nie po max_tokens). Błąd dostawcy = null (wywołujący decyduje o zamiennikach). */
  private async zNaprawa<T>(
    zap: ZapytanieAiMarki,
    odczyt: (tekst: string) => { ok: true; dane: T } | { ok: false; bledy: string[] },
    konf: KonfiguracjaMarki,
    kto: KtoMarki,
    licznik: LicznikAiMarki,
    timeoutMs: number,
    obrazPng?: Buffer,
  ): Promise<T | null> {
    return (await this.zNaprawaPowod(zap, odczyt, konf, kto, licznik, timeoutMs, obrazPng)).dane;
  }

  /**
   * Jak `zNaprawa`, z powodem porażki do logów i decyzji (paczka 134 – diagnoza serii z samych zamienników):
   * 'wywolanie' (błąd dostawcy: brak klucza, budżet platformy, HTTP 4xx/5xx, limit czasu), 'uciecie' (stop_reason
   * max_tokens – bez naprawy), 'walidacja' (odpowiedź nie przeszła odczytu po rundzie naprawy). Logi bez danych klienta:
   * rodzaj operacji, model, tokeny wyjścia, powód i lista błędów walidacji (ścieżki JSON, komunikaty walidatora).
   */
  private async zNaprawaPowod<T>(
    zap: ZapytanieAiMarki,
    odczyt: (tekst: string) => { ok: true; dane: T } | { ok: false; bledy: string[] },
    konf: KonfiguracjaMarki,
    kto: KtoMarki,
    licznik: LicznikAiMarki,
    timeoutMs: number,
    obrazPng?: Buffer,
    o: { bezNaprawy?: boolean } = {},
  ): Promise<{ dane: T | null; powod: 'wywolanie' | 'uciecie' | 'walidacja' | null; szczegoly?: string }> {
    const model = zap.klasaModelu === 'tani' ? konf.modelZmian : konf.modelGeneracji;
    let etap = 'wywołanie';
    try {
      const r = await this.wywolaj(zap, zap.wiadomosci, konf, kto, licznik, timeoutMs, obrazPng);
      const w = odczyt(r.wynik);
      if (w.ok) return { dane: w.dane, powod: null };
      if (ucieta(r)) {
        this.logger.warn(`Marka ${zap.rodzaj} (${model}): odrzucono – UCIĘCIE: stop_reason max_tokens przy limicie ${zap.maxTokens} (wyjście ${r.wyj} tokenów, z myśleniem) – bez naprawy`);
        return { dane: null, powod: 'uciecie', szczegoly: `max_tokens ${zap.maxTokens}` };
      }
      if (o.bezNaprawy) {
        this.logger.warn(`Marka ${zap.rodzaj} (${model}): odrzucono – WALIDACJA (bez naprawy): ${w.bledy.slice(0, 8).join('; ')}`);
        return { dane: null, powod: 'walidacja', szczegoly: w.bledy.slice(0, 8).join('; ') };
      }
      this.logger.warn(`Marka ${zap.rodzaj} (${model}): runda naprawy – błędy walidacji: ${w.bledy.slice(0, 8).join('; ')}`);
      etap = 'naprawa';
      const r2 = await this.wywolaj(zap, [...zap.wiadomosci, ...naprawaMarki(r.wynik, w.bledy)], konf, kto, licznik, timeoutMs, obrazPng);
      const w2 = odczyt(r2.wynik);
      if (w2.ok) return { dane: w2.dane, powod: null };
      if (ucieta(r2)) {
        this.logger.warn(`Marka ${zap.rodzaj} (${model}): odrzucono – UCIĘCIE w naprawie (wyjście ${r2.wyj} tokenów, limit ${zap.maxTokens})`);
        return { dane: null, powod: 'uciecie', szczegoly: `naprawa: max_tokens ${zap.maxTokens}` };
      }
      this.logger.warn(`Marka ${zap.rodzaj} (${model}): odrzucono – WALIDACJA po naprawie: ${w2.bledy.slice(0, 8).join('; ')}`);
      return { dane: null, powod: 'walidacja', szczegoly: w2.bledy.slice(0, 8).join('; ') };
    } catch (e) {
      if (e instanceof OdpowiedzUcietaAiError) {
        this.logger.warn(`Marka ${zap.rodzaj} (${model}): odrzucono – UCIĘCIE (${etap}): ${e.message} – bez naprawy`);
        return { dane: null, powod: 'uciecie', szczegoly: `max_tokens ${zap.maxTokens}` };
      }
      const status = e instanceof HttpException ? ` HTTP ${e.getStatus()}` : '';
      const opis = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      this.logger.warn(`Marka ${zap.rodzaj} (${model}): odrzucono – WYWOŁANIE (${etap})${status}: ${opis.slice(0, 300)}`);
      return { dane: null, powod: 'wywolanie', szczegoly: opis.slice(0, 300) };
    }
  }

  private async rezerwujAlbo(userId: string, pole: PoleLimituMarki, konf: KonfiguracjaMarki, w: WersjaKreatora | null): Promise<RezerwacjaMarki> {
    const r = await rezerwuj(this.prisma, userId, pole, konf, w);
    if (!r) throw blad(HttpStatus.PAYMENT_REQUIRED, pole === 'serie' ? KOMUNIKATY.limitSerii : KOMUNIKATY.limitZmian, pole === 'serie' ? 'LIMIT_SERII' : 'LIMIT_ZMIAN_AI');
    return r;
  }

  /** Znaki wydane w branży (bez tej marki): do preselekcji i do odrzucenia zbyt podobnych. */
  private async wydaneWBranzy(branza: string, markaId: string) {
    const wpisy = await this.prisma.kreatorMarkaOdcisk.findMany({
      where: { branzaKlucz: kluczBranzy(branza), OR: [{ markaId: null }, { markaId: { not: markaId } }] },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: { rodzina: true, odciskParametrow: true, pHash: true },
    });
    return { znaki: wpisy.map((w) => znakZOdcisku(w.rodzina, w.odciskParametrow)), odciski: wpisy };
  }

  private ocenyKierunku(nazwa: string, odciski: { odciskParametrow: string | null; pHash: string }[]) {
    return {
      ocen: (k: KierunekMarki) => ocenProjekt(k.projekt, nazwa).bledy,
      podobny: (k: KierunekMarki) => zbytPodobny(odciskZnaku(k.projekt.sygnet, nazwa), odciski),
    };
  }

  private kierunekDoSerii(k: KierunekMarki, nazwa: string, odswiezenie?: SeriaMarki['kierunki'][number]['odswiezenie']): SeriaMarki['kierunki'][number] {
    return { ...k, ...(odswiezenie ? { odswiezenie } : {}), ostrzezenia: ocenProjekt(k.projekt, nazwa).ostrzezenia };
  }

  /**
   * POST /marki/:id/serie – 6 kierunków z briefu (paczka 134): 4 symbole zaprojektowane przez AI + 2 z biblioteki
   * powiązane z nazwą/branżą. Kolejno: wywołanie (z jedną rundą naprawy) → kontrola jakości (walidator, reguły,
   * czytelność, podobieństwo do wydanych) → samoocena wizją (opcjonalna) → ponowienie slotów z symbolem, gdy odrzuconych
   * > 1 → w miejsce pozostałych odrzuconych monogram z liter nazwy.
   *
   * Decyzja (paczka 134): całkowita awaria AI = 503 AI_NIEDOSTEPNE, seria NIE powstaje, limit wraca. Seria z samych
   * losowych szablonów nie ma związku z firmą (feedback właściciela), a pokazana jako „propozycje” udaje wynik AI.
   */
  async seria(kto: KtoMarki, id: string): Promise<WidokMarki> {
    const { konf, wersjaKreatora: w } = await this.dostep(kto.userId);
    const r = await this.wlasna(kto.userId, id);
    if (r.zrodlo !== 'nowa') throw blad(HttpStatus.CONFLICT, r.zrodlo === 'odswiezenie' ? 'Dla wgranego logo użyj „Odśwież” – trzy kierunki zmian.' : 'Wgrane logo zostaje bez zmian – zaproponujemy do niego Key Visual.', 'ZLE_ZRODLO');
    const dane = odczytajDaneMarki(r.dane);
    this.sprawdzBrief(dane.brief);
    const rez = await this.rezerwujAlbo(kto.userId, 'serie', konf, w);
    const licznik = nowyLicznikMarki();
    let zuzyta = false;
    try {
      const brief = dane.brief;
      const { znaki, odciski } = await this.wydaneWBranzy(brief.branza, r.id);
      const pres = preselekcjaSerii(brief, znaki, randomInt(2 ** 31 - 1), { symboleAi: konf.symboleAi ? 4 : 0 });
      const zap = budujZapytanieSerii(brief, pres);
      const odczyt = (t: string) => odczytajSerie(t, brief, pres, { walidujSymbol: walidatorSymboluBiblioteki });
      const w1 = await this.zNaprawaPowod<WynikSerii>(zap, odczyt, konf, kto, licznik, TIMEOUT_SERII_MS);
      if (!w1.dane) {
        this.logger.warn(`Seria marki ${r.id}: AI niedostępne (${w1.powod}) – 503 bez serii, limit zwrócony`);
        throw blad(HttpStatus.SERVICE_UNAVAILABLE, KOMUNIKATY.aiSeria, 'AI_NIEDOSTEPNE');
      }
      const wynik = w1.dane;
      const oceny = this.ocenyKierunku(brief.nazwa, odciski);
      // Kontrola jakości: reguły biblioteki i podobieństwo do znaków wydanych w branży (walidator i czytelność symbolu – w odczycie).
      wynik.kierunki = wynik.kierunki.map((k, i) => {
        if (!k) return null;
        const problemy = oceny.ocen(k);
        if (problemy.length || oceny.podobny(k)) {
          wynik.odrzucone.push({ slot: pres.sloty[i]!.id, powod: problemy.length ? `reguły: ${problemy.slice(0, 3).join('; ')}` : 'podobny do znaku wydanego w branży' });
          return null;
        }
        return k;
      });
      if (konf.samoocena) await this.samoocena(wynik, pres, brief, konf, kto, licznik, r.id);
      // Ponowienie slotów z symbolem AI (jedna krótka runda), gdy odrzuconych > 1.
      const symbolowe: SlotDoPonowienia[] = pres.sloty
        .map((s, i) => ({ s, i }))
        .filter(({ s, i }) => s.symbolAi && !wynik.kierunki[i])
        .map(({ s }) => ({ slot: s.id, powod: [...wynik.odrzucone].reverse().find((o) => o.slot === s.id)?.powod ?? 'odrzucony' }));
      if (symbolowe.length >= PROG_PONOWIENIA) {
        const zapP = budujZapytaniePonowienia(brief, pres, symbolowe);
        const wp = await this.zNaprawaPowod(zapP, (t) => odczytajPonowienie(t, brief, pres, symbolowe, { walidujSymbol: walidatorSymboluBiblioteki }), konf, kto, licznik, TIMEOUT_PONOWIENIA_MS, undefined, { bezNaprawy: true });
        symbolowe.forEach((d, j) => {
          const k = wp.dane?.kierunki[j] ?? null;
          const i = pres.sloty.findIndex((s) => s.id === d.slot);
          if (k && !oceny.ocen(k).length && !oceny.podobny(k)) wynik.kierunki[i] = k;
        });
        if (wp.dane?.odrzucone.length) wynik.odrzucone.push(...wp.dane.odrzucone);
      }
      const gotowa = uzupelnijSerie(wynik, brief, pres, oceny);
      if (gotowa.zamienione.length) this.logger.log(`Seria marki ${r.id}: monogram zamiast ${gotowa.zamienione.map((z) => `${z.slot} (${z.powod.slice(0, 160)})`).join('; ')}`);
      if (gotowa.kierunki.every((k) => k.zrodloZnaku === 'zamiennik')) {
        this.logger.warn(`Seria marki ${r.id}: wszystkie kierunki odrzucone – 503 bez serii, limit zwrócony`);
        throw blad(HttpStatus.SERVICE_UNAVAILABLE, KOMUNIKATY.aiSeria, 'AI_NIEDOSTEPNE');
      }
      await this.prisma.kreatorMarkaSeria.create({
        data: {
          markaId: r.id,
          rodzaj: 'nowa',
          kierunki: gotowa.kierunki.map((k) => this.kierunekDoSerii(k, brief.nazwa)) as unknown as Prisma.InputJsonValue,
          ...(wynik.strategia ? { strategia: wynik.strategia as Prisma.InputJsonValue } : {}),
        },
      });
      zuzyta = true;
      return this.widok(await this.zapisz(r, dane), w);
    } finally {
      if (!zuzyta) await zwolnij(this.prisma, kto.userId, rez).catch(() => undefined);
      await dolicz(this.prisma, kto.userId, licznik).catch((e: unknown) => this.logger.error(`Zużycie marki: ${String(e)}`));
    }
  }

  /**
   * Samoocena wizją (paczka 134): propozycje z AI renderowane do jednej planszy PNG (kafle 256 px, 3 × 2), jedno
   * wywołanie tańszym modelem; kierunki z oceną < 3 (najwyżej 3) – do wymiany (`odrzucone`). Pomijana, gdy szacunek
   * kosztu > konf.samoocenaMaksUsd. Błąd renderu albo AI = brak samooceny (seria idzie dalej), nigdy błąd klienta.
   */
  private async samoocena(wynik: WynikSerii, pres: PreselekcjaMarki, brief: BriefMarki, konf: KonfiguracjaMarki, kto: KtoMarki, licznik: LicznikAiMarki, markaId: string): Promise<void> {
    const kafle = wynik.kierunki.map((k, i) => ({ k, slot: pres.sloty[i]! })).filter((x): x is { k: KierunekMarki; slot: PreselekcjaMarki['sloty'][number] } => !!x.k);
    if (kafle.length < 2) return;
    const stawki = /haiku/i.test(konf.modelZmian) ? STAWKI_HAIKU_45 : STAWKI_SONNET_55;
    const szacunek = szacujKosztSamooceny(kafle.length, stawki);
    if (szacunek > konf.samoocenaMaksUsd) {
      this.logger.log(`Samoocena marki ${markaId}: pominięta – szacunek ${szacunek.toFixed(4)} USD > limit ${konf.samoocenaMaksUsd} USD`);
      return;
    }
    let plansza: Buffer;
    try {
      plansza = await this.planszaSamooceny(kafle.map((x) => x.k), brief);
    } catch (e) {
      this.logger.warn(`Samoocena marki ${markaId}: render planszy – ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    const ids = kafle.map((x) => x.k.id);
    const zap = budujZapytanieSamooceny(brief, kafle.map((x) => ({ id: x.k.id, ...(x.k.koncepcja ? { koncepcja: x.k.koncepcja } : {}) })));
    const w = await this.zNaprawaPowod(zap, (t) => odczytajSamoocene(t, ids), konf, kto, licznik, TIMEOUT_PONOWIENIA_MS, plansza, { bezNaprawy: true });
    if (!w.dane) return;
    const wymiana = doWymianySamoocena(w.dane);
    for (const d of wymiana) {
      const i = pres.sloty.findIndex((s) => s.id === d.slot);
      if (i >= 0 && wynik.kierunki[i]) {
        wynik.kierunki[i] = null;
        wynik.odrzucone.push(d);
      }
    }
    this.logger.log(`Samoocena marki ${markaId}: ${w.dane.map((o) => `${o.id} t${o.trafnosc}/c${o.czytelnosc}/k${o.klisze}`).join(', ')}${wymiana.length ? ` – do wymiany ${wymiana.map((d) => d.slot).join(', ')}` : ''}`);
  }

  /** Plansza samooceny: logo każdego kierunku (układ pionowy, napis na krzywych) w kaflu 256 px, siatka 3 kolumn, białe tło. */
  private async planszaSamooceny(kierunki: KierunekMarki[], brief: BriefMarki): Promise<Buffer> {
    const K = KAFEL_SAMOOCENY;
    const kol = Math.min(SIATKA_SAMOOCENY.kolumny, kierunki.length);
    const wiersze = Math.ceil(kierunki.length / SIATKA_SAMOOCENY.kolumny);
    const kafle = await Promise.all(
      kierunki.map(async (k) => {
        const m = { wersjaModelu: WERSJA_MODELU_MARKI, zrodlo: 'nowa', brief, projekt: k.projekt, kv: { wzor: 'rzadki', tloCiemne: false }, kontakt: {}, zgody: {} } as Marka;
        const z = await this.generator.logo(m, k.projekt.sygnet.typ === 'brak' ? 'napis' : 'pionowy', 'kolor', { metadane: false });
        return pngZSvg(z.svg, { szerokosc: K - 32, wysokosc: K - 32, tlo: '#FFFFFF' });
      }),
    );
    return sharp({ create: { width: K * kol, height: K * wiersze, channels: 3, background: '#FFFFFF' } })
      .composite(kafle.map((png, i) => ({ input: png, left: (i % kol) * K + 16, top: Math.floor(i / kol) * K + 16 })))
      .png()
      .toBuffer();
  }

  /** POST /marki/:id/odswiezenie – 3 kierunki (ewolucja / odświeżenie / nowy) dla wgranego logo. */
  async odswiezenie(kto: KtoMarki, id: string): Promise<WidokMarki> {
    const { konf, wersjaKreatora: w } = await this.dostep(kto.userId);
    const r = await this.wlasna(kto.userId, id);
    const dane = odczytajDaneMarki(r.dane);
    if (r.zrodlo !== 'odswiezenie' || !dane.analiza) throw blad(HttpStatus.CONFLICT, 'Odświeżenie działa dla wgranego logo – wgraj je w „Odśwież logo”.', 'ZLE_ZRODLO');
    this.sprawdzBrief(dane.brief);
    const rez = await this.rezerwujAlbo(kto.userId, 'serie', konf, w);
    const licznik = nowyLicznikMarki();
    let zuzyta = false;
    try {
      const a = dane.analiza;
      const obecne: ObecneLogo = {
        ...(a.opis ? { opis: a.opis } : {}),
        elementy: a.elementy,
        ...(a.krojPodobny ? { krojPodobny: a.krojPodobny } : {}),
        problemy: a.problemy,
        kolory: a.kolory.map((k) => k.hex),
        ...(a.wektorSvg ? { sygnet: { typ: 'wgrany' as const, svg: a.wektorSvg } } : {}),
      };
      const { znaki, odciski } = await this.wydaneWBranzy(dane.brief.branza, r.id);
      const pres: PreselekcjaMarki = preselekcjaOdswiezenia(dane.brief, obecne, znaki, randomInt(2 ** 31 - 1));
      if (!konf.symboleAi) for (const s of pres.sloty) s.symbolAi = false;
      const zap = budujZapytanieOdswiezenia(dane.brief, obecne, pres);
      const wynik = await this.zNaprawa(zap, (t) => odczytajOdswiezenie(t, dane.brief, obecne, pres, { walidujSymbol: walidatorSymboluBiblioteki }), konf, kto, licznik, TIMEOUT_SERII_MS);
      // Paczka 134: jak w serii – bez odpowiedzi AI nie składamy trzech losowych kierunków; 503 i zwrot limitu.
      if (!wynik) throw blad(HttpStatus.SERVICE_UNAVAILABLE, KOMUNIKATY.aiSeria, 'AI_NIEDOSTEPNE');
      const oceny = this.ocenyKierunku(dane.brief.nazwa, odciski);
      const kierunki = TYPY_ODSWIEZENIA.map((typ, i) => {
        const slot = pres.sloty[i]!;
        const z: KierunekOdswiezenia | null = wynik?.kierunki[i] ?? null;
        const zachowuje = z?.kierunek.projekt.sygnet.typ === 'wgrany';
        let k = z?.kierunek ?? null;
        if (k && !zachowuje && (oceny.ocen(k).length || oceny.podobny(k))) k = null;
        const kier = k ?? { ...zamiennikKierunku(slot, dane.brief, (pres.ziarno + i * 7919) >>> 0, oceny), id: typ };
        return this.kierunekDoSerii(kier, dane.brief.nazwa, {
          typ,
          coZostaje: z?.zostaje ?? (typ === 'nowy' ? 'Nazwa firmy.' : 'Nazwa firmy i charakter kolorów.'),
          coSieZmienia: z?.zmienia ?? (typ === 'ewolucja' ? 'Krój i proporcje napisu.' : 'Znak i krój.'),
          rozpoznawalnosc: ROZPOZNAWALNOSC[z?.rozpoznawalnosc ?? (typ === 'ewolucja' ? 3 : typ === 'odswiezenie' ? 2 : 1)],
        });
      });
      await this.prisma.kreatorMarkaSeria.create({ data: { markaId: r.id, rodzaj: 'odswiezenie', kierunki: kierunki as unknown as Prisma.InputJsonValue } });
      zuzyta = true;
      return this.widok(await this.zapisz(r, dane), w);
    } finally {
      if (!zuzyta) await zwolnij(this.prisma, kto.userId, rez).catch(() => undefined);
      await dolicz(this.prisma, kto.userId, licznik).catch((e: unknown) => this.logger.error(`Zużycie marki: ${String(e)}`));
    }
  }

  // ───────────────────────── wybór i edycja ─────────────────────────

  /** Sygnet od AI / wgrany można wybrać tylko taki, jaki serwer pokazał (seria, analiza) – nie dowolny SVG z panelu. */
  private sygnetDozwolony(s: Sygnet, dozwolone: Sygnet[]): boolean {
    if (s.typ === 'biblioteka') return !!rodzinaPoId(s.rodzina);
    if (s.typ === 'brak') return true;
    return dozwolone.some((d) => d.typ === s.typ && 'svg' in d && d.svg === s.svg);
  }

  private oceniony(projekt: ProjektLogo, nazwa: string): void {
    for (const f of [projekt.napis.font, projekt.fonty.naglowki, projekt.fonty.tekst]) {
      if (!czyFontWKatalogu(f)) throw blad(HttpStatus.BAD_REQUEST, `Krój „${f}” spoza katalogu – wybierz krój z listy.`, 'KROJ_SPOZA_KATALOGU');
    }
    const o = ocenProjekt(projekt, nazwa);
    if (!o.ok) throw blad(HttpStatus.UNPROCESSABLE_ENTITY, o.bledy[0] ?? 'Projekt nie spełnia zasad marki.', 'OCENA', { bledy: o.bledy });
  }

  /**
   * Zapis znaku w rejestrze pod blokadą branży: ponowne sprawdzenie podobieństwa (dwie firmy z jednej branży w tej
   * samej chwili nie dostaną podobnych znaków) i upsert odcisku tej marki.
   */
  private async zapiszZRejestrem(r: KreatorMarka, dane: DaneMarki, kto: KtoMarki, nowaWersja: boolean): Promise<KreatorMarka> {
    const m = dane.marka!;
    const odcisk = odciskZnaku(m.projekt.sygnet, m.brief.nazwa);
    const branzaKlucz = kluczBranzy(m.brief.branza);
    const liczbaSerii = await this.prisma.kreatorMarkaSeria.count({ where: { markaId: r.id } });
    return this.prisma.$transaction(async (tx) => {
      if (odcisk && m.zrodlo !== 'wgrane') {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`kreator-marki-rejestr:${branzaKlucz}`}))`;
        const wydane = await tx.kreatorMarkaOdcisk.findMany({
          where: { branzaKlucz, OR: [{ markaId: null }, { markaId: { not: r.id } }] },
          select: { odciskParametrow: true, pHash: true },
        });
        if (zbytPodobny(odcisk, wydane)) throw blad(HttpStatus.CONFLICT, KOMUNIKATY.podobny, 'PODOBNY_ZNAK');
        await tx.kreatorMarkaOdcisk.upsert({
          where: { markaId: r.id },
          create: { markaId: r.id, userId: kto.userId, branzaKlucz, ...odcisk },
          update: { branzaKlucz, ...odcisk },
        });
      } else {
        await tx.kreatorMarkaOdcisk.deleteMany({ where: { markaId: r.id } });
      }
      return tx.kreatorMarka.update({
        where: { id: r.id },
        data: { dane: dane as unknown as Prisma.InputJsonValue, nazwa: dane.brief.nazwa, etap: etapMarki(dane, liczbaSerii), ...(nowaWersja ? { wersja: { increment: 1 } } : {}) },
      });
    });
  }

  async wybierz(kto: KtoMarki, id: string, body: unknown): Promise<WidokMarki> {
    const { wersjaKreatora: w } = await this.dostep(kto.userId);
    const r = await this.wlasna(kto.userId, id);
    const b = (body ?? {}) as Partial<WybierzBody>;
    if (typeof b.seriaId !== 'string' || typeof b.kierunekId !== 'string') throw new BadRequestException({ message: 'Wskaż serię i kierunek.', kod: 'NIEPOPRAWNE_DANE' });
    const seria = /^[0-9a-f-]{36}$/i.test(b.seriaId) ? await this.prisma.kreatorMarkaSeria.findFirst({ where: { id: b.seriaId, markaId: r.id } }) : null;
    const kierunki = (seria?.kierunki ?? []) as unknown as SeriaMarki['kierunki'];
    const kier = kierunki.find((k) => k.id === b.kierunekId);
    if (!seria || !kier) throw new NotFoundException({ message: 'Nie ma takiego kierunku w tej serii.', kod: 'NIE_MA_KIERUNKU' });
    const dane = odczytajDaneMarki(r.dane);
    const projekt = b.projekt === undefined ? ProjektLogo.parse(kier.projekt) : zod(ProjektLogo, b.projekt, 'Popraw projekt logo.');
    if (!this.sygnetDozwolony(projekt.sygnet, [kier.projekt.sygnet])) throw blad(HttpStatus.BAD_REQUEST, 'Ten znak nie pochodzi z wybranego kierunku.', 'ZNAK_SPOZA_KIERUNKU');
    this.oceniony(projekt, dane.brief.nazwa);
    const poprzednia = dane.marka;
    const marka: Marka = {
      wersjaModelu: WERSJA_MODELU_MARKI,
      zrodlo: r.zrodlo as Marka['zrodlo'],
      brief: dane.brief,
      projekt,
      ...(seria.strategia ? { strategia: seria.strategia as Marka['strategia'] } : {}),
      kv: poprzednia?.kv ?? { wzor: 'rzadki', tloCiemne: false },
      kontakt: poprzednia?.kontakt ?? {},
      zgody: { ...dane.zgody, ...(poprzednia?.zgody ?? {}) },
    };
    dane.marka = marka;
    const zapisana = await this.zapiszZRejestrem(r, dane, kto, !!poprzednia);
    await this.audit.record({ action: KreatorMarkiActions.KREATOR_MARKI_WYBRANO, userId: kto.userId, actorUserId: kto.actorUserId, details: { markaId: r.id, seriaId: seria.id, kierunekId: kier.id, wersja: zapisana.wersja } });
    return this.widok(zapisana, w);
  }

  private wymagajProjektu(dane: DaneMarki): Marka {
    if (!dane.marka) throw blad(HttpStatus.CONFLICT, KOMUNIKATY.bezProjektu, 'BEZ_PROJEKTU');
    return dane.marka;
  }

  /** PUT /marki/:id/projekt – „Dopasuj” bez AI: walidacja, krój z katalogu, reguły, rejestr przy zmianie znaku. */
  async projekt(kto: KtoMarki, id: string, body: unknown): Promise<WidokMarki> {
    const { wersjaKreatora: w } = await this.dostep(kto.userId);
    const r = await this.wlasna(kto.userId, id);
    const dane = odczytajDaneMarki(r.dane);
    const m = this.wymagajProjektu(dane);
    const projekt = zod(ProjektLogo, (body as { projekt?: unknown } | null)?.projekt, 'Popraw projekt logo.');
    const serie = await this.prisma.kreatorMarkaSeria.findMany({ where: { markaId: r.id }, select: { kierunki: true } });
    const dozwolone = [m.projekt.sygnet, ...serie.flatMap((s) => (s.kierunki as unknown as SeriaMarki['kierunki']).map((k) => k.projekt.sygnet))];
    if (!this.sygnetDozwolony(projekt.sygnet, dozwolone)) throw blad(HttpStatus.BAD_REQUEST, 'Ten znak nie pochodzi z propozycji tej marki.', 'ZNAK_SPOZA_KIERUNKU');
    if (m.zrodlo === 'wgrane' && JSON.stringify(projekt.sygnet) !== JSON.stringify(m.projekt.sygnet)) throw blad(HttpStatus.BAD_REQUEST, 'Wgrane logo zostaje bez zmian – zmieniasz kolory materiałów i kroje.', 'LOGO_WGRANE');
    this.oceniony(projekt, m.brief.nazwa);
    dane.marka = { ...m, projekt };
    const zmianaZnaku = JSON.stringify(projekt.sygnet) !== JSON.stringify(m.projekt.sygnet) || projekt.napis.font !== m.projekt.napis.font;
    const zapisana = zmianaZnaku ? await this.zapiszZRejestrem(r, dane, kto, true) : await this.zapisz(r, dane, { nowaWersja: true });
    return this.widok(zapisana, w);
  }

  async kv(kto: KtoMarki, id: string, body: unknown): Promise<WidokMarki> {
    const { wersjaKreatora: w } = await this.dostep(kto.userId);
    const r = await this.wlasna(kto.userId, id);
    const dane = odczytajDaneMarki(r.dane);
    const m = this.wymagajProjektu(dane);
    const kv = zod(UstawieniaKv, body, 'Popraw ustawienia materiałów.');
    if (kv.zdjecieZasobId) {
      const z = /^[0-9a-f-]{36}$/i.test(kv.zdjecieZasobId) ? await this.prisma.kreatorZasob.findFirst({ where: { id: kv.zdjecieZasobId, userId: kto.userId }, select: { id: true } }) : null;
      if (!z) throw blad(HttpStatus.BAD_REQUEST, 'Nie ma takiego zdjęcia w Twojej bibliotece.', 'NIE_MA_ZDJECIA');
    }
    if (kv.haslo && !sprawdzPolecenieMarki(kv.haslo).ok) throw blad(HttpStatus.UNPROCESSABLE_ENTITY, sprawdzPolecenieMarki(kv.haslo).bledy[0]!.komunikat, 'ZNANA_MARKA');
    dane.marka = { ...m, kv };
    return this.widok(await this.zapisz(r, dane), w);
  }

  async kontakt(kto: KtoMarki, id: string, body: unknown): Promise<WidokMarki> {
    const { wersjaKreatora: w } = await this.dostep(kto.userId);
    const r = await this.wlasna(kto.userId, id);
    const dane = odczytajDaneMarki(r.dane);
    const m = this.wymagajProjektu(dane);
    dane.marka = { ...m, kontakt: zod(DaneKontaktoweMarki, body, 'Popraw dane kontaktowe.') };
    return this.widok(await this.zapisz(r, dane), w);
  }

  /** Zgody tylko odblokowują pobranie (bez AI i limitów) – działają także na koncie z samym odczytem (paczka 134). */
  async zgody(kto: KtoMarki, id: string, body: unknown): Promise<WidokMarki> {
    const { wersjaKreatora: w, plikiJakHosting } = await this.dostep(kto.userId, 'odczyt');
    const r = await this.wlasna(kto.userId, id);
    const b = (body ?? {}) as ZgodyBody;
    const dane = odczytajDaneMarki(r.dane);
    const teraz = new Date().toISOString();
    const nowe: ('sprawdzilemTmview' | 'oswiadczeniePraw')[] = [];
    if (b.sprawdzilemTmview === true) nowe.push('sprawdzilemTmview');
    if (b.oswiadczeniePraw === true) nowe.push('oswiadczeniePraw');
    if (!nowe.length) throw new BadRequestException({ message: 'Zaznacz oświadczenie, które potwierdzasz.', kod: 'NIEPOPRAWNE_DANE' });
    for (const z of nowe) {
      dane.zgody[z] = teraz;
      if (dane.marka) dane.marka = { ...dane.marka, zgody: { ...dane.marka.zgody, [z]: teraz } };
    }
    const zapisana = await this.zapisz(r, dane);
    for (const z of nowe) await this.audit.record({ action: KreatorMarkiActions.KREATOR_MARKI_ZGODA, userId: kto.userId, actorUserId: kto.actorUserId, details: { markaId: r.id, zgoda: z, kiedy: teraz } });
    return this.widok(zapisana, w, plikiJakHosting);
  }

  // ───────────────────────── drobne zmiany AI, KV od AI ─────────────────────────

  async drobnaZmiana(kto: KtoMarki, id: string, body: unknown): Promise<{ wynik: Record<string, string>; widok: WidokMarki }> {
    const { konf, wersjaKreatora: w } = await this.dostep(kto.userId);
    const r = await this.wlasna(kto.userId, id);
    const b = (body ?? {}) as Partial<DrobnaZmianaBody>;
    if (!b.rodzaj || !(RODZAJE_DROBNYCH as readonly string[]).includes(b.rodzaj)) throw new BadRequestException({ message: 'Nieznany rodzaj zmiany.', kod: 'NIEPOPRAWNE_DANE' });
    const polecenie = typeof b.polecenie === 'string' ? b.polecenie.trim().slice(0, 300) : undefined;
    const sp = sprawdzPolecenieMarki(polecenie);
    if (!sp.ok) throw blad(HttpStatus.UNPROCESSABLE_ENTITY, sp.bledy[0]!.komunikat, 'ZNANA_MARKA');
    const dane = odczytajDaneMarki(r.dane);
    const rez = await this.rezerwujAlbo(kto.userId, 'zmianyAi', konf, w);
    const licznik = nowyLicznikMarki();
    let zuzyta = false;
    try {
      const rodzaj = b.rodzaj;
      const zap = budujZapytanieDrobnejZmiany(rodzaj, dane.brief, dane.marka?.projekt, polecenie);
      const d = await this.zNaprawa(zap, (t) => odczytajDrobnaZmiane(rodzaj, t), konf, kto, licznik, TIMEOUT_ZMIANY_MS);
      if (!d) throw blad(HttpStatus.SERVICE_UNAVAILABLE, KOMUNIKATY.ai, 'AI_NIEDOSTEPNE');
      let wynik: Record<string, string>;
      if (d.rodzaj === 'haslo' || d.rodzaj === 'podpis') wynik = Object.fromEntries(d.propozycje.map((p, i) => [String(i + 1), p]));
      else if (d.rodzaj === 'opis' || d.rodzaj === 'dlaczego') wynik = { tekst: d.tekst };
      else if (d.rodzaj === 'kolory') wynik = { ...d.nazwy };
      else wynik = {};
      // zapis przy marce: opis marki i nazwy kolorów (hasło i podpis – propozycje do wyboru, zapis przez PUT kv / PATCH brief)
      let zapisana = r;
      if (d.rodzaj === 'opis') {
        dane.opisMarki = d.tekst;
        zapisana = await this.zapisz(r, dane);
      } else if (d.rodzaj === 'kolory') {
        dane.nazwyKolorow = { ...d.nazwy };
        zapisana = await this.zapisz(r, dane);
      }
      zuzyta = true;
      return { wynik, widok: await this.widok(zapisana, w) };
    } finally {
      if (!zuzyta) await zwolnij(this.prisma, kto.userId, rez).catch(() => undefined);
      await dolicz(this.prisma, kto.userId, licznik).catch((e: unknown) => this.logger.error(`Zużycie marki: ${String(e)}`));
    }
  }

  /** POST /marki/:id/kv-ai – Key Visual pod wgrane logo (logo bez zmian): paleta materiałów, wzór, hasło, kroje. */
  async kvAi(kto: KtoMarki, id: string, body: unknown): Promise<WidokMarki> {
    const { konf, wersjaKreatora: w } = await this.dostep(kto.userId);
    const r = await this.wlasna(kto.userId, id);
    const dane = odczytajDaneMarki(r.dane);
    const m = this.wymagajProjektu(dane);
    const polecenie = typeof (body as { polecenie?: unknown } | null)?.polecenie === 'string' ? ((body as { polecenie: string }).polecenie.trim().slice(0, 500) || undefined) : undefined;
    const sp = sprawdzPolecenieMarki(polecenie);
    if (!sp.ok) throw blad(HttpStatus.UNPROCESSABLE_ENTITY, sp.bledy[0]!.komunikat, 'ZNANA_MARKA');
    const rez = await this.rezerwujAlbo(kto.userId, 'zmianyAi', konf, w);
    const licznik = nowyLicznikMarki();
    let zuzyta = false;
    try {
      const logo = { kolory: dane.analiza?.kolory.map((k) => k.hex) ?? [m.projekt.kolory.glowny, m.projekt.kolory.akcent], ...(dane.analiza?.opis ? { opis: dane.analiza.opis } : {}), ...(dane.analiza?.krojPodobny ? { krojPodobny: dane.analiza.krojPodobny } : {}) };
      const zap = budujZapytanieKv(dane.brief, logo, polecenie);
      const d = await this.zNaprawa(zap, (t) => odczytajKv(t, logo), konf, kto, licznik, TIMEOUT_ZMIANY_MS);
      if (!d) throw blad(HttpStatus.SERVICE_UNAVAILABLE, KOMUNIKATY.ai, 'AI_NIEDOSTEPNE');
      const kolory = m.zrodlo === 'wgrane' ? d.kolory : { ...m.projekt.kolory, paleta: d.kolory.paleta, barwa: d.kolory.barwa, charakter: d.kolory.charakter };
      const projekt: ProjektLogo = { ...m.projekt, kolory, fonty: d.fonty };
      dane.marka = { ...m, projekt, kv: { ...m.kv, wzor: d.kv.wzor, ...(d.kv.haslo ? { haslo: d.kv.haslo } : {}) } };
      zuzyta = true;
      return this.widok(await this.zapisz(r, dane, { nowaWersja: true }), w);
    } finally {
      if (!zuzyta) await zwolnij(this.prisma, kto.userId, rez).catch(() => undefined);
      await dolicz(this.prisma, kto.userId, licznik).catch((e: unknown) => this.logger.error(`Zużycie marki: ${String(e)}`));
    }
  }

  // ───────────────────────── wgranie logo ─────────────────────────

  /**
   * POST /wgraj – multipart: plik ≤ maksRozmiarWgraniaMb, zrodlo 'wgrane' | 'odswiezenie', oswiadczenie = 'tak'.
   * Kolejność: oświadczenie → limit marek → rozmiar → typ po zawartości → pomiary/walidacja → analiza wizją (zmiana AI;
   * bez limitu albo przy błędzie AI – sam pomiar) → logo znanej marki = odmowa → zapis pliku w magazynie i marki.
   */
  async wgraj(kto: KtoMarki, plik: Buffer | undefined, pola: Record<string, unknown>): Promise<WidokMarki> {
    const { konf, wersjaKreatora: w } = await this.dostep(kto.userId);
    if (pola.oswiadczenie !== 'tak') throw blad(HttpStatus.BAD_REQUEST, 'Potwierdź, że masz prawo do używania tego logo.', 'BRAK_OSWIADCZENIA');
    const zrodlo = pola.zrodlo;
    if (zrodlo !== 'wgrane' && zrodlo !== 'odswiezenie') throw blad(HttpStatus.BAD_REQUEST, 'Wybierz, co zrobić z logo: Key Visual albo odświeżenie.', 'ZLE_ZRODLO');
    await this.limitMarek(kto.userId, konf, w);
    if (!plik?.length) throw blad(HttpStatus.BAD_REQUEST, 'Wybierz plik z logo.', 'BRAK_PLIKU');
    const maks = konf.maksRozmiarWgraniaMb * 1024 * 1024;
    if (plik.length > maks) throw blad(HttpStatus.PAYLOAD_TOO_LARGE, `Plik jest za duży (${(plik.length / 1048576).toFixed(1).replace('.', ',')} MB, limit ${konf.maksRozmiarWgraniaMb} MB).`, 'PLIK_ZA_DUZY');
    const typ = rozpoznajTypWgranego(plik);
    if (!typ) throw blad(HttpStatus.UNSUPPORTED_MEDIA_TYPE, KOMUNIKAT_TYP, 'TYP_NIEOBSLUGIWANY');
    let pomiar;
    try {
      pomiar = await zmierzPlik(plik, typ);
    } catch (e) {
      if (e instanceof BladWgrania) throw blad(e.status, e.message, e.kod);
      throw e;
    }
    const nazwa = typeof pola.nazwa === 'string' && pola.nazwa.trim() ? pola.nazwa.trim().slice(0, 60) : 'Moja firma';
    const branza = typeof pola.branza === 'string' && pola.branza.trim() ? pola.branza.trim().slice(0, 80) : 'inna';
    const brief = zod(BriefMarki, { nazwa, branza, opis: 'Logo wgrane przez klienta.', rodzaj: 'znak-i-napis' }, 'Popraw nazwę i branżę.');
    const sn = sprawdzBriefMarki(brief);
    if (!sn.ok) throw blad(HttpStatus.UNPROCESSABLE_ENTITY, sn.bledy[0]!.komunikat, 'ZNANA_MARKA');

    // analiza wizją: jedna zmiana AI; bez limitu albo przy błędzie dostawcy – sam pomiar serwera
    const licznik = nowyLicznikMarki();
    let analizaAi: AnalizaLogo | null = null;
    const rez = await rezerwuj(this.prisma, kto.userId, 'zmianyAi', konf, w);
    try {
      if (rez) {
        const zap = budujZapytanieAnalizyLogo({ nazwa, branza }, pomiar.pomiary);
        analizaAi = await this.zNaprawa(zap, (t) => odczytajAnalizeLogo(t, pomiar.pomiary), konf, kto, licznik, TIMEOUT_ZMIANY_MS, pomiar.podglad);
        if (!analizaAi) await zwolnij(this.prisma, kto.userId, rez).catch(() => undefined);
      }
    } finally {
      await dolicz(this.prisma, kto.userId, licznik).catch((e: unknown) => this.logger.error(`Zużycie marki: ${String(e)}`));
    }
    if (analizaAi?.znanaMarka) throw blad(HttpStatus.UNPROCESSABLE_ENTITY, KOMUNIKAT_ZNANA_MARKA, 'ZNANA_MARKA');

    const plikId = randomUUID();
    const klucz = `${kto.userId}/marka/${plikId}.${typ}`;
    const kluczPodgladu = `${kto.userId}/marka/${plikId}-podglad.png`;
    await this.storage.putObject(ObjectBuckets.KREATOR_ZASOBY, klucz, plik, { contentType: typ === 'svg' ? 'image/svg+xml' : typ === 'png' ? 'image/png' : 'image/jpeg' });
    await this.storage.putObject(ObjectBuckets.KREATOR_ZASOBY, kluczPodgladu, pomiar.podglad, { contentType: 'image/png' });
    const teraz = new Date();
    const kolory = pomiar.pomiary.kolory.map((k) => k.hex);
    const analiza: AnalizaZapisana = {
      plikId,
      kolory: pomiar.pomiary.kolory,
      tlo: pomiar.pomiary.tlo,
      gradient: pomiar.pomiary.gradient,
      cien: pomiar.pomiary.cien,
      szerokosc: pomiar.pomiary.szerokosc,
      wysokosc: pomiar.pomiary.wysokosc,
      problemy: analizaAi?.problemy ?? problemyPomiarow(pomiar.pomiary as PomiaryLogo),
      elementy: analizaAi?.elementy ?? [],
      ...(analizaAi?.krojPodobny ? { krojPodobny: analizaAi.krojPodobny } : {}),
      ...(analizaAi?.opis ? { opis: analizaAi.opis } : {}),
      ...(pomiar.sygnetSvg ? { wektorSvg: pomiar.sygnetSvg } : {}),
      ...(pomiar.zgodnosc !== undefined ? { zgodnosc: pomiar.zgodnosc } : {}),
    };
    const dane: DaneMarki = { brief, marka: null, analiza, zgody: { oswiadczeniePraw: teraz.toISOString() } };
    if (zrodlo === 'wgrane') {
      if (!pomiar.sygnetSvg) throw blad(HttpStatus.UNPROCESSABLE_ENTITY, 'Nie udało się zamienić tego obrazu na wektor – wgraj logo w SVG albo PNG na jednolitym tle.', 'WEKTOR_NIEUDANY');
      const naglowki = analizaAi?.krojPodobny ?? 'Manrope';
      const barwa = analizaAi?.propozycjaPalety.barwa ?? Math.round(hexDoOklch(kolory[0] ?? '#1F2937').h) % 360;
      dane.marka = {
        wersjaModelu: WERSJA_MODELU_MARKI,
        zrodlo: 'wgrane',
        brief,
        projekt: ProjektLogo.parse({
          sygnet: { typ: 'wgrany', svg: pomiar.sygnetSvg },
          napis: { font: naglowki, waga: 600, styl: 'jeden', rozstrzelenie: 0, podpis: false },
          kolory: koloryLogoKv(kolory, barwa, analizaAi?.propozycjaPalety.charakter ?? 'jasna'),
          uklad: 'sygnet',
          fonty: { naglowki, tekst: krojTekstuDla(naglowki) },
        }),
        kv: { wzor: 'rzadki', tloCiemne: false },
        kontakt: {},
        zgody: { oswiadczeniePraw: teraz.toISOString() },
      };
    }
    const r = await this.prisma.$transaction(async (tx) => {
      const marka = await tx.kreatorMarka.create({ data: { userId: kto.userId, nazwa, zrodlo, etap: etapMarki(dane, 0), dane: dane as unknown as Prisma.InputJsonValue } });
      await tx.kreatorMarkaPlik.create({ data: { id: plikId, userId: kto.userId, markaId: marka.id, typ, bajty: plik.length, sha256: pomiar.sha256, klucz, kluczPodgladu, oswiadczenieAt: teraz } });
      return marka;
    });
    await this.audit.record({ action: KreatorMarkiActions.KREATOR_MARKI_WGRANO, userId: kto.userId, actorUserId: kto.actorUserId, details: { markaId: r.id, plikId, typ, bajty: plik.length, oswiadczeniePraw: teraz.toISOString() } });
    return this.widok(r, w);
  }

  // ───────────────────────── napis, logo, materiały, pliki ─────────────────────────

  async ksztaltNapisu(userId: string, q: Record<string, unknown>): Promise<KsztaltNapisu> {
    await this.dostep(userId);
    const font = typeof q.font === 'string' ? q.font : '';
    const tekst = typeof q.tekst === 'string' ? q.tekst : '';
    const waga = Number(q.waga ?? 600);
    const rozs = Number(q.rozstrzelenie ?? 0);
    if (!czyFontWKatalogu(font)) throw blad(HttpStatus.BAD_REQUEST, 'Krój spoza katalogu.', 'KROJ_SPOZA_KATALOGU');
    if (!tekst.trim() || [...tekst].length > 80) throw blad(HttpStatus.BAD_REQUEST, 'Napis: od 1 do 80 znaków.', 'NIEPOPRAWNE_DANE');
    if (!Number.isInteger(waga) || waga < 100 || waga > 900 || !Number.isInteger(rozs) || rozs < -50 || rozs > 600) throw blad(HttpStatus.BAD_REQUEST, 'Niepoprawna grubość albo rozstrzelenie.', 'NIEPOPRAWNE_DANE');
    const k = await this.napis.ksztaltuj(tekst, font, waga, rozs);
    if (!k) throw blad(HttpStatus.SERVICE_UNAVAILABLE, 'Krój jest chwilowo niedostępny – spróbuj za chwilę.', 'KROJ_NIEDOSTEPNY');
    return k;
  }

  private async markaKonta(userId: string, id: string, tryb: TrybDostepu): Promise<{ r: KreatorMarka; dane: DaneMarki; m: Marka; d: Dostep }> {
    const d = await this.dostep(userId, tryb);
    const r = await this.wlasna(userId, id);
    const dane = odczytajDaneMarki(r.dane);
    return { r, dane, m: this.wymagajProjektu(dane), d };
  }

  async logoSvg(userId: string, id: string, q: Record<string, unknown>): Promise<string> {
    const { m } = await this.markaKonta(userId, id, 'odczyt');
    const uklad = (UKLADY_LOGO as readonly string[]).includes(String(q.uklad)) ? (q.uklad as UkladLogo) : ukladyMarki(m)[0]!;
    const wariant = (WARIANTY_KOLORU as readonly string[]).includes(String(q.wariant)) ? (q.wariant as WariantKoloru) : 'kolor';
    return (await this.generator.logo(m, uklad, wariant)).svg;
  }

  private async kontekstPlikow(userId: string, r: KreatorMarka, m: Marka, podglad = false): Promise<KontekstPlikow> {
    const k: KontekstPlikow = { data: new Date().toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw' }), podglad };
    if (m.kv.zdjecieZasobId) {
      try {
        const z = await this.prisma.kreatorZasob.findFirst({ where: { id: m.kv.zdjecieZasobId, userId }, select: { id: true, szerokosc: true } });
        if (z) {
          const szer = z.szerokosc >= 1600 ? 1600 : z.szerokosc >= 960 ? 960 : 480;
          const buf = await this.storage.getObjectBuffer(ObjectBuckets.KREATOR_ZASOBY, kluczWariantu(userId, z.id, szer, 'jpg'));
          k.zdjecieUrl = `data:image/jpeg;base64,${buf.toString('base64')}`;
        }
      } catch (e) {
        this.logger.warn(`Zdjęcie KV marki ${r.id}: ${String(e)}`);
      }
    }
    const url = this.adresPubliczny(r.id, 'logo-stopka.png');
    if (url) k.logoStopkiUrl = url;
    return k;
  }

  /** GET /marki/:id/material/:material.(svg|png) – podgląd; bez Pakietu materiały Pakietu ze znakiem wodnym. */
  async material(userId: string, id: string, material: string, format: 'svg' | 'png'): Promise<{ dane: Buffer; typ: string }> {
    const { r, m, d } = await this.markaKonta(userId, id, 'odczyt');
    if (!(MATERIALY_KV as readonly string[]).includes(material)) throw new NotFoundException({ message: 'Nie ma takiego materiału.', kod: 'NIE_MA_MATERIALU' });
    const wersja = await this.wersjaPlikow(userId, d.konf, d);
    const pakietowy = katalogPlikow(m).some((p) => p.material === material && p.pakiet);
    const kontekst = await this.kontekstPlikow(userId, r, m, pakietowy && wersja !== 'pakiet');
    if (format === 'svg') {
      const s = await this.generator.materialSvg(m, material as MaterialKv, kontekst);
      if (!s) throw new NotFoundException({ message: 'Ten materiał nie ma podglądu SVG.', kod: 'NIE_MA_MATERIALU' });
      return { dane: Buffer.from(s.svg), typ: 'image/svg+xml' };
    }
    const png = await this.generator.materialPng(m, material as MaterialKv, { ...kontekst, podglad: true });
    if (!png) throw new NotFoundException({ message: 'Ten materiał nie ma podglądu PNG.', kod: 'NIE_MA_MATERIALU' });
    return { dane: png, typ: 'image/png' };
  }

  async pliki(userId: string, id: string) {
    const { r, d } = await this.markaKonta(userId, id, 'odczyt');
    return (await this.widok(r, d.wersjaKreatora, d.plikiJakHosting)).pliki;
  }

  /** Blokada pliku → wyjątek (402 PROBA / PAKIET_WYMAGANY, 409 TMVIEW_WYMAGANY). */
  private wyjatekBlokady(b: NonNullable<ReturnType<typeof blokadaPliku>>): HttpException {
    if (b === 'PROBA') return blad(HttpStatus.PAYMENT_REQUIRED, KOMUNIKATY.proba, 'PROBA');
    if (b === 'PAKIET_WYMAGANY') return blad(HttpStatus.PAYMENT_REQUIRED, KOMUNIKATY.pakiet, 'PAKIET_WYMAGANY');
    return blad(HttpStatus.CONFLICT, KOMUNIKATY.tmview, 'TMVIEW_WYMAGANY');
  }

  async plik(kto: KtoMarki, id: string, nazwa: string): Promise<WynikPliku> {
    const { r, dane, m, d } = await this.markaKonta(kto.userId, id, 'odczyt');
    const opis = katalogPlikow(m).find((p) => p.plik === nazwa);
    if (!opis) throw new NotFoundException({ message: 'Nie ma takiego pliku.', kod: 'NIE_MA_PLIKU' });
    const wersja = await this.wersjaPlikow(kto.userId, d.konf, d);
    const b = blokadaPliku(opis, wersja, !!(m.zgody.sprawdzilemTmview ?? dane.zgody.sprawdzilemTmview));
    if (b) throw this.wyjatekBlokady(b);
    const wynik = await this.generator.plik(m, nazwa, await this.kontekstPlikow(kto.userId, r, m));
    if (!wynik) throw new NotFoundException({ message: 'Tego pliku nie da się przygotować dla tej marki.', kod: 'NIE_MA_PLIKU' });
    if (opis.druk || opis.grupa === 'kv') await this.audit.record({ action: KreatorMarkiActions.KREATOR_MARKI_POBRANO, userId: kto.userId, actorUserId: kto.actorUserId, details: { markaId: r.id, plik: nazwa } });
    return wynik;
  }

  async eksport(kto: KtoMarki, id: string): Promise<WynikPliku> {
    const { r, dane, m, d } = await this.markaKonta(kto.userId, id, 'odczyt');
    const wersja = await this.wersjaPlikow(kto.userId, d.konf, d);
    const tm = !!(m.zgody.sprawdzilemTmview ?? dane.zgody.sprawdzilemTmview);
    const dostepne = new Set(katalogPlikow(m).filter((p) => !blokadaPliku(p, wersja, tm)).map((p) => p.plik));
    if (!dostepne.size) throw this.wyjatekBlokady('PROBA');
    const dane2 = await this.generator.eksportZip(m, dostepne, await this.kontekstPlikow(kto.userId, r, m));
    await this.audit.record({ action: KreatorMarkiActions.KREATOR_MARKI_POBRANO, userId: kto.userId, actorUserId: kto.actorUserId, details: { markaId: r.id, plik: 'eksport.zip', plikow: dostepne.size } });
    return { dane: dane2, typ: 'application/zip', nazwa: `${nazwaPliku(m.brief.nazwa)}-marka.zip` };
  }

  /** POST /marki/:id/stopka-email – sprawdzony HTML (logo PNG z publicznego adresu), wersja tekstowa i instrukcje. */
  async stopkaEmail(userId: string, id: string): Promise<StopkaEmailWynik> {
    const { r, m, d } = await this.markaKonta(userId, id, 'zapis');
    const l = await stanLimitow(this.prisma, userId, d.konf, d.wersjaKreatora);
    if (l.wersja === 'proba') throw this.wyjatekBlokady('PROBA');
    const url = this.adresPubliczny(r.id, 'logo-stopka.png');
    const logo = url ? await this.generator.logoStopki(m) : null;
    const html = this.generator.stopkaHtml(m, url ?? undefined, logo ? { szer: logo.szer, wys: logo.wys } : undefined);
    const mapuj = (i: { nazwa: string; kroki: string[]; uwaga?: string; sprawdzone: boolean }) => ({ program: i.nazwa, kroki: i.uwaga ? [...i.kroki, `Uwaga: ${i.uwaga}`] : i.kroki, sprawdzone: i.sprawdzone });
    if (m.kontakt.email) {
      const wynik = await this.stopka.ustaw({ userId, skrzynka: m.kontakt.email, html });
      if (!wynik.ustawiono) return { html: wynik.html, tekst: wynik.tekst, instrukcje: wynik.instrukcje.map(mapuj) };
    }
    const b = bladStopki(html);
    if (b) throw blad(HttpStatus.UNPROCESSABLE_ENTITY, b, 'STOPKA');
    return { html, tekst: stopkaTekstowa(html), instrukcje: INSTRUKCJE_STOPKI.filter((i) => !i.tylkoZespol).map(mapuj) };
  }

  // ───────────────────────── pliki publiczne (stopka e-mail, Kreator stron) ─────────────────────────

  private publicznyAdresApi(): string {
    return (this.config.get<string>('PUBLIC_API_URL') ?? this.config.get<string>('API_BASE_URL') ?? 'https://api.verris.pl').replace(/\/+$/, '');
  }

  /** https adres pliku publicznego marki albo null (bez klucza aplikacji – brak podpisu, brak adresu). */
  adresPubliczny(markaId: string, plik: PlikPubliczny): string | null {
    const klucz = this.config.get<string>('appKmsKey');
    const api = this.publicznyAdresApi();
    if (!klucz || !/^https:\/\//.test(api)) return null;
    return `${api}/kreator-marki/p/${utworzTokenMarki(klucz, markaId)}/${plik}`;
  }

  async plikPubliczny(token: string, plik: string): Promise<Buffer> {
    const klucz = this.config.get<string>('appKmsKey');
    const id = klucz ? sprawdzTokenMarki(klucz, token) : null;
    if (!id || !['logo-stopka.png', 'favicon.png', 'og.png'].includes(plik)) throw new NotFoundException('Nie znaleziono pliku.');
    const r = await this.prisma.kreatorMarka.findUnique({ where: { id } });
    const dane = r ? odczytajDaneMarki(r.dane) : null;
    if (!r || !dane?.marka) throw new NotFoundException('Nie znaleziono pliku.');
    const klucz2 = `${id}|${r.wersja}|${plik}`;
    const z = this.plikiPubliczne.get(klucz2);
    if (z) return z;
    const m = dane.marka;
    const dane2 =
      plik === 'logo-stopka.png'
        ? (await this.generator.logoStopki(m)).png
        : plik === 'og.png'
          ? await this.generator.obrazOg(m)
          : (await this.generator.plik(m, 'icon-192.png'))!.dane;
    if (this.plikiPubliczne.size >= 300) this.plikiPubliczne.delete(this.plikiPubliczne.keys().next().value!);
    this.plikiPubliczne.set(klucz2, dane2);
    return dane2;
  }

  // ───────────────────────── zakupy ─────────────────────────

  async zakup(kto: KtoMarki, rodzaj: 'PAKIET' | 'DRUGA_MARKA', body: unknown): Promise<WynikZakupuMarki> {
    const konf = await this.modul(kto.userId);
    const w = await wersjaKreatora(this.prisma, kto.userId);
    const wynik = await this.zakupy.kup(kto.userId, kto.actorUserId, rodzaj, (body ?? {}) as never, konf, w);
    if (wynik.status === 'oplacony') return { status: 'oplacony', stan: await this.stan(kto.userId) };
    return wynik;
  }

  // ───────────────────────── dostawca marki (Kreator stron) ─────────────────────────

  async markiKonta(userId: string) {
    const marki = await this.prisma.kreatorMarka.findMany({ where: { userId, etap: 'projekt' }, orderBy: { updatedAt: 'desc' }, select: { id: true, nazwa: true, wersja: true } });
    return marki.map((m) => ({ markaId: m.id, nazwa: m.nazwa, wersja: m.wersja }));
  }

  async markaDoStrony(userId: string, markaId: string): Promise<{ r: KreatorMarka; m: Marka } | null> {
    const r = /^[0-9a-f-]{36}$/i.test(markaId) ? await this.prisma.kreatorMarka.findFirst({ where: { id: markaId, userId } }) : null;
    if (!r) return null;
    const m = odczytajDaneMarki(r.dane).marka;
    return m ? { r, m } : null;
  }
}

/** Nazwa pliku ZIP z nazwy marki: ASCII, bez znaków spoza [a-z0-9-]. */
export function nazwaPliku(nazwa: string): string {
  const z = nazwa
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return z || 'marka';
}

