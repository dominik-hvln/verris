import { z } from 'zod';
import type { Marka } from '../marka/model.ts';
import { Paleta, type Strona } from '../model.ts';
import { czyFontWKatalogu } from '../style/katalog-stylow.ts';
import { korygujPalete } from '../style/kolory.ts';
import { MarkaStrony } from './model.ts';
import { czystySvgMarki, MAKS_SVG_FAVICONU } from './svg.ts';

/**
 * Zastosowanie marki do strony z kreatora (paczka 130, koncepcja rozdz. 3.9) – funkcje czyste, wspólne dla API
 * (podgląd zmian i zapis) i testów. Nic nie zmienia się samo: API pokazuje klientowi listę zmian (`zmiany`), klient
 * wybiera, co zastosować (logo, paleta, fonty, favicon), dopiero wtedy powstaje nowa wersja strony.
 */

const tekst = (max: number) => z.string().trim().min(1).max(max);

/**
 * Migawka marki od dostawcy marki (API kreatora marki): to, co trafia do strony (MarkaStrony bez `uzyj`), oraz paleta
 * i fonty marki, które przy zastosowaniu przechodzą do `motyw` strony.
 */
export const MigawkaMarki = MarkaStrony.omit({ uzyj: true }).extend({
  paleta: Paleta,
  fonty: z.object({ naglowki: tekst(60), tekst: tekst(60) }),
});
export type MigawkaMarki = z.infer<typeof MigawkaMarki>;

export const ELEMENTY_MARKI = ['logo', 'paleta', 'fonty', 'favicon'] as const;
export type ElementMarki = (typeof ELEMENTY_MARKI)[number];
export type OpcjeZastosowaniaMarki = Record<ElementMarki, boolean>;
export const WSZYSTKO_Z_MARKI: OpcjeZastosowaniaMarki = { logo: true, paleta: true, fonty: true, favicon: true };

export interface ZmianaMarki {
  element: ElementMarki | 'obrazOg';
  /** Tekst dla klienta („Logo w nagłówku i stopce”, „Paleta z marki”, „Fonty: X / Y”, „Favicon…”). */
  opis: string;
}

export interface WynikZastosowaniaMarki {
  strona: Strona;
  zmiany: ZmianaMarki[];
  /** Czego nie dało się zastosować (np. krój spoza katalogu kreatora stron). */
  ostrzezenia: string[];
}

const OPIS = {
  logo: 'Logo w nagłówku i stopce',
  logoBez: 'Logo: wraca inicjał firmy w nagłówku i stopce',
  paleta: 'Paleta z marki',
  favicon: 'Favicon (ikona w karcie przeglądarki)',
  faviconBez: 'Favicon: wraca ikona z inicjałem',
  obrazOg: 'Obraz do udostępniania w mediach społecznościowych',
};

const takieSame = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const logoMigawki = (m: Pick<MigawkaMarki, 'logoPoziome' | 'logoPionowe' | 'sygnet' | 'logoNegatyw' | 'kolory'>) => [m.logoPoziome, m.logoPionowe, m.sygnet, m.logoNegatyw, m.kolory];

/**
 * Strona z marką: migawka (logo, favicon, kolory kanałów) w `strona.marka`, paleta i fonty marki w `motyw`.
 * Elementy wyłączone w `opcje`: paleta i fonty zostają jak są, logo i favicon – wyłączone (inicjał firmy).
 * Wszystkie opcje wyłączone = strona bez zmian. Nie mutuje wejścia. Migawka spoza schematu = wyjątek (zod).
 */
export function zastosujMarke(strona: Strona, migawka: MigawkaMarki, opcje: OpcjeZastosowaniaMarki = WSZYSTKO_Z_MARKI): WynikZastosowaniaMarki {
  const m = MigawkaMarki.parse(migawka);
  const zmiany: ZmianaMarki[] = [];
  const ostrzezenia: string[] = [];
  if (!ELEMENTY_MARKI.some((e) => opcje[e])) return { strona, zmiany, ostrzezenia };

  const wynik = structuredClone(strona);
  const przed = strona.marka;
  const tejMarki = przed?.markaId === m.markaId;

  const logoPrzed = !!przed?.uzyj.logo;
  if (opcje.logo && (!logoPrzed || !tejMarki || !takieSame(logoMigawki(przed!), logoMigawki(m)))) zmiany.push({ element: 'logo', opis: OPIS.logo });
  if (!opcje.logo && logoPrzed) zmiany.push({ element: 'logo', opis: OPIS.logoBez });

  const faviconPrzed = !!przed?.uzyj.favicon;
  if (opcje.favicon && (!faviconPrzed || !tejMarki || przed!.favicon !== m.favicon || przed!.faviconPng !== m.faviconPng)) zmiany.push({ element: 'favicon', opis: OPIS.favicon });
  if (!opcje.favicon && faviconPrzed) zmiany.push({ element: 'favicon', opis: OPIS.faviconBez });

  if (opcje.logo && m.obrazOg && !strona.seo.obrazOg && (!tejMarki || przed?.obrazOg !== m.obrazOg || !logoPrzed)) zmiany.push({ element: 'obrazOg', opis: OPIS.obrazOg });

  const { paleta: _p, fonty: _f, ...doStrony } = m;
  wynik.marka = MarkaStrony.parse({ ...doStrony, uzyj: { logo: opcje.logo, favicon: opcje.favicon } });

  if (opcje.paleta) {
    const paleta = korygujPalete(m.paleta).paleta;
    if (!takieSame(paleta, strona.motyw.paleta)) zmiany.push({ element: 'paleta', opis: OPIS.paleta });
    wynik.motyw.paleta = paleta;
  }

  if (opcje.fonty) {
    const poza = [m.fonty.naglowki, m.fonty.tekst].filter((f) => !czyFontWKatalogu(f));
    if (poza.length) {
      ostrzezenia.push(`${poza.length > 1 ? 'Kroje' : 'Krój'} ${poza.map((f) => `„${f}”`).join(' i ')} ${poza.length > 1 ? 'nie są dostępne' : 'nie jest dostępny'} w kreatorze stron – fonty strony bez zmian.`);
    } else if (m.fonty.naglowki !== strona.motyw.fonty.naglowki || m.fonty.tekst !== strona.motyw.fonty.tekst) {
      wynik.motyw.fonty = { ...strona.motyw.fonty, naglowki: m.fonty.naglowki, tekst: m.fonty.tekst };
      zmiany.push({ element: 'fonty', opis: `Fonty: ${m.fonty.naglowki} / ${m.fonty.tekst}` });
    }
  }
  return { strona: wynik, zmiany, ostrzezenia };
}

/** Strona bez migawki marki (logo i favicon z inicjału; paleta i fonty zostają). */
export function odlaczMarke(strona: Strona): WynikZastosowaniaMarki {
  if (!strona.marka) return { strona, zmiany: [], ostrzezenia: [] };
  const { marka, ...reszta } = strona;
  const zmiany: ZmianaMarki[] = [];
  if (marka.uzyj.logo) zmiany.push({ element: 'logo', opis: OPIS.logoBez });
  if (marka.uzyj.favicon) zmiany.push({ element: 'favicon', opis: OPIS.faviconBez });
  return { strona: reszta, zmiany, ostrzezenia: [] };
}

/**
 * Stan marki na stronie względem marki z konta:
 * - 'brak' – strona bez marki; 'inna' – strona ma inną markę konta;
 * - 'starsza' – ta sama marka w starszej wersji (panel: „Twoja marka się zmieniła – zaktualizuj stronę”);
 * - 'aktualna' – ta sama wersja (albo nowsza na stronie, np. po przywróceniu marki z historii).
 */
export type StanMarkiStrony = 'brak' | 'inna' | 'starsza' | 'aktualna';

export interface PorownanieMarki {
  stan: StanMarkiStrony;
  wersjaNaStronie: number | null;
  wersjaMarki: number;
  /** Co zmieni „Użyj marki” ze wszystkimi elementami (podgląd, nic nie zapisuje). */
  zmiany: ZmianaMarki[];
}

export function porownajMarke(strona: Strona, migawka: MigawkaMarki): PorownanieMarki {
  const m = MigawkaMarki.parse(migawka);
  const na = strona.marka;
  const stan: StanMarkiStrony = !na ? 'brak' : na.markaId !== m.markaId ? 'inna' : na.wersja < m.wersja ? 'starsza' : 'aktualna';
  return { stan, wersjaNaStronie: na?.wersja ?? null, wersjaMarki: m.wersja, zmiany: zastosujMarke(strona, m).zmiany };
}

/** Wygląd marki na stronie do podglądu przed/po w panelu (logo jako samodzielny SVG z kolorami – do <img>). */
export interface WygladMarki {
  /** SVG logo poziomego z kolorami wpisanymi na stałe; null = inicjał firmy. */
  logo: string | null;
  favicon: string | null;
  inicjal: string;
  nazwa: string;
  paleta: Pick<Strona['motyw']['paleta'], 'tlo' | 'tekst' | 'akcent' | 'powierzchnia' | 'ciemne'>;
  fonty: { naglowki: string; tekst: string };
}

export function wygladMarki(strona: Strona): WygladMarki {
  const p = strona.motyw.paleta;
  const m = strona.marka;
  const plik = m ? { plik: { glowny: m.kolory.glowny, akcent: m.kolory.akcent } } : {};
  return {
    logo: m?.uzyj.logo ? czystySvgMarki(m.logoPoziome, plik) : null,
    favicon: m?.uzyj.favicon ? czystySvgMarki(m.favicon, plik, MAKS_SVG_FAVICONU) : null,
    inicjal: (strona.firma.nazwa.trim().match(/\p{L}|\p{N}/u)?.[0] ?? '').toUpperCase(),
    nazwa: strona.firma.nazwa,
    paleta: { tlo: p.tlo, tekst: p.tekst, akcent: p.akcent, powierzchnia: p.powierzchnia, ciemne: p.ciemne },
    fonty: { naglowki: strona.motyw.fonty.naglowki, tekst: strona.motyw.fonty.tekst },
  };
}

/** Pliki migawki wygenerowane przez kreator marki (SVG po złożeniu logo, adresy PNG/OG w magazynie konta). */
export interface PlikiMigawkiMarki {
  markaId: string;
  wersja: number;
  logoPoziome: string;
  logoPionowe?: string;
  sygnet?: string;
  logoNegatyw?: string;
  favicon: string;
  faviconPng?: string;
  obrazOg?: string;
}

/** Migawka z modelu marki (kontrakt marka/model.ts) i plików wygenerowanych przy zapisie marki – dla dostawcy marki w API. */
export function migawkaZMarki(marka: Marka, pliki: PlikiMigawkiMarki): MigawkaMarki {
  const k = marka.projekt.kolory;
  return MigawkaMarki.parse({
    ...pliki,
    nazwa: marka.brief.nazwa,
    kolory: { glowny: k.glowny, akcent: k.akcent },
    paleta: k.paleta,
    fonty: { naglowki: marka.projekt.fonty.naglowki, tekst: marka.projekt.fonty.tekst },
  });
}
