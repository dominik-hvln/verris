import { z } from 'zod';
import {
  BriefMarki,
  Marka,
  migrujMarke,
  type MaterialKv,
  type PlikMarki,
  type PozycjaListyMarek,
  type UkladLogo,
  type WariantKoloru,
  type WersjaMarkiKonta,
} from '@verris/kreator';

/**
 * Kreator marki (paczka 131) – zawartość kolumny `KreatorMarka.dane` i czyste reguły widoku: etap, katalog plików
 * eksportu z blokadami wg wersji konta (próba / hosting / Pakiet) i zgody TMview, klucz branży do rejestru znaków.
 */

/** Analiza wgranego logo zapisana przy marce (bez obrazu – oryginał i podgląd są w magazynie, KreatorMarkaPlik). */
export const AnalizaZapisana = z.object({
  plikId: z.string(),
  kolory: z.array(z.object({ hex: z.string(), udzial: z.number() })).max(12),
  tlo: z.string().nullable().default(null),
  gradient: z.boolean().default(false),
  cien: z.boolean().default(false),
  szerokosc: z.number().int(),
  wysokosc: z.number().int(),
  problemy: z.array(z.string()).max(40).default([]),
  elementy: z.array(z.string()).max(20).default([]),
  krojPodobny: z.string().optional(),
  opis: z.string().optional(),
  /** Sygnet z pliku po walidacji (SVG) albo z wektoryzacji – ewolucja w odświeżeniu może go zachować. */
  wektorSvg: z.string().max(2_000_000).optional(),
  zgodnosc: z.number().optional(),
});
export type AnalizaZapisana = z.infer<typeof AnalizaZapisana>;

const DataIso = z.string().datetime();

export const DaneMarki = z.object({
  brief: BriefMarki,
  marka: Marka.nullable().default(null),
  analiza: AnalizaZapisana.optional(),
  /** Zgody i oświadczenia z datą (przed wyborem kierunku – potem kopiowane do Marka.zgody). */
  zgody: z.object({ oswiadczeniePraw: DataIso.optional(), sprawdzilemTmview: DataIso.optional() }).default({}),
  /** Drobne zmiany AI zapisywane przy marce (opis marki, nazwy kolorów). */
  opisMarki: z.string().max(600).optional(),
  nazwyKolorow: z.object({ glowny: z.string(), akcent: z.string(), akcentJasny: z.string() }).optional(),
});
export type DaneMarki = z.infer<typeof DaneMarki>;

/** Odczyt z bazy: marka przez migrujMarke (kontrakt WERSJA_MODELU_MARKI); uszkodzone dane = błąd (nie zgadujemy). */
export function odczytajDaneMarki(json: unknown): DaneMarki {
  const o = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>;
  const marka = o.marka ? migrujMarke(o.marka) : null;
  return DaneMarki.parse({ ...o, marka });
}

export type EtapMarki = PozycjaListyMarek['etap'];

export function etapMarki(dane: DaneMarki, liczbaSerii: number): EtapMarki {
  if (dane.marka) return 'projekt';
  return liczbaSerii > 0 ? 'kierunki' : 'brief';
}

/** Branża do rejestru znaków: małe litery, bez znaków diakrytycznych i interpunkcji, pojedyncze spacje. */
export function kluczBranzy(branza: string): string {
  return branza
    .toLocaleLowerCase('pl-PL')
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .slice(0, 80);
}

// ───────────────────────── katalog plików ─────────────────────────

/** Nazwy układów w plikach (rzeczowniki rodzaju nijakiego – „logo poziome”). */
export const NAZWY_UKLADOW: Record<UkladLogo, string> = { poziomy: 'poziome', pionowy: 'pionowe', sygnet: 'sygnet', napis: 'napis' };
export const NAZWY_WARIANTOW: Record<WariantKoloru, string> = { kolor: 'kolor', mono: 'mono', negatyw: 'negatyw', bialy: 'bialy' };
const OPIS_UKLADU: Record<UkladLogo, string> = { poziomy: 'Logo poziome', pionowy: 'Logo pionowe', sygnet: 'Sam znak', napis: 'Sam napis' };
const OPIS_WARIANTU: Record<WariantKoloru, string> = { kolor: 'w kolorach marki', mono: 'jednobarwne', negatyw: 'negatyw (na kolorze marki)', bialy: 'białe (na ciemne tło)' };

/** Układy, w których ta marka ma pliki: wgrane logo – tylko ono samo; marka bez znaku – sam napis. */
export function ukladyMarki(m: Marka): UkladLogo[] {
  if (m.zrodlo === 'wgrane') return ['sygnet'];
  if (m.projekt.sygnet.typ === 'brak') return ['napis'];
  return ['poziomy', 'pionowy', 'sygnet', 'napis'];
}

export const WARIANTY_PLIKOW: WariantKoloru[] = ['kolor', 'mono', 'negatyw', 'bialy'];

/** Szerokości PNG logo w eksporcie ZIP (plik z listy ma największą). */
export const SZEROKOSCI_PNG_LOGO = [500, 1000, 2000] as const;

export interface OpisPliku {
  plik: string;
  grupa: PlikMarki['grupa'];
  opis: string;
  /** Wymaga Pakietu marki (materiały KV, druk, księga). */
  pakiet: boolean;
  /** Plik do druku – przed pobraniem klient potwierdza sprawdzenie w TMview. */
  druk: boolean;
  material?: MaterialKv;
  typ: string;
}

const PNG = 'image/png';
const SVG = 'image/svg+xml';
const PDF = 'application/pdf';

/** Pełny katalog plików marki (kolejność = kolejność na liście w panelu i w ZIP). */
export function katalogPlikow(m: Marka): OpisPliku[] {
  const pliki: OpisPliku[] = [];
  for (const u of ukladyMarki(m)) {
    for (const w of WARIANTY_PLIKOW) {
      const nazwa = `logo-${NAZWY_UKLADOW[u]}-${NAZWY_WARIANTOW[w]}`;
      const opis = `${OPIS_UKLADU[u]} ${OPIS_WARIANTU[w]}`;
      pliki.push({ plik: `${nazwa}.svg`, grupa: 'logo', opis: `${opis} – SVG (wektor)`, pakiet: false, druk: false, typ: SVG });
      pliki.push({ plik: `${nazwa}.png`, grupa: 'logo', opis: `${opis} – PNG ${SZEROKOSCI_PNG_LOGO[SZEROKOSCI_PNG_LOGO.length - 1]} px, przezroczyste tło`, pakiet: false, druk: false, typ: PNG });
    }
  }
  pliki.push({ plik: 'logo.pdf', grupa: 'druk', opis: 'Logo – PDF wektorowy (warianty i kolory z odpowiednikami CMYK)', pakiet: false, druk: true, typ: PDF });
  pliki.push(
    { plik: 'favicon.ico', grupa: 'ikony', opis: 'Ikona strony (16, 32 i 48 px)', pakiet: false, druk: false, material: 'favicon', typ: 'image/x-icon' },
    { plik: 'favicon.svg', grupa: 'ikony', opis: 'Ikona strony – SVG z wariantem dla trybu ciemnego', pakiet: false, druk: false, material: 'favicon', typ: SVG },
    { plik: 'apple-touch-icon.png', grupa: 'ikony', opis: 'Ikona na ekran iPhone’a i iPada (180 px)', pakiet: false, druk: false, typ: PNG },
    { plik: 'icon-192.png', grupa: 'ikony', opis: 'Ikona aplikacji 192 px', pakiet: false, druk: false, typ: PNG },
    { plik: 'icon-512.png', grupa: 'ikony', opis: 'Ikona aplikacji 512 px', pakiet: false, druk: false, typ: PNG },
    { plik: 'icon-512-maskable.png', grupa: 'ikony', opis: 'Ikona aplikacji 512 px (maskable – Android)', pakiet: false, druk: false, typ: PNG },
    { plik: 'site.webmanifest', grupa: 'ikony', opis: 'Manifest aplikacji webowej (ikony i kolory)', pakiet: false, druk: false, typ: 'application/manifest+json' },
    { plik: 'kroje.zip', grupa: 'kroje', opis: 'Kroje pisma marki (WOFF2) z licencją SIL Open Font License', pakiet: false, druk: false, typ: 'application/zip' },
    { plik: 'stopka-email.html', grupa: 'stopka', opis: 'Stopka e-mail (HTML do wklejenia w programie pocztowym)', pakiet: false, druk: false, material: 'stopka-email', typ: 'text/html; charset=utf-8' },
    { plik: 'wzor.svg', grupa: 'kv', opis: 'Wzór ze znaku – kafel SVG', pakiet: true, druk: false, material: 'wzor', typ: SVG },
    { plik: 'wzor.png', grupa: 'kv', opis: 'Wzór ze znaku – kafel PNG', pakiet: true, druk: false, material: 'wzor', typ: PNG },
    { plik: 'post.png', grupa: 'kv', opis: 'Post 1080 × 1080 px', pakiet: true, druk: false, material: 'post', typ: PNG },
    { plik: 'story.png', grupa: 'kv', opis: 'Story 1080 × 1920 px', pakiet: true, druk: false, material: 'story', typ: PNG },
    { plik: 'okladka-facebook.png', grupa: 'kv', opis: 'Okładka Facebooka', pakiet: true, druk: false, material: 'okladka-facebook', typ: PNG },
    { plik: 'baner-linkedin.png', grupa: 'kv', opis: 'Baner LinkedIn', pakiet: true, druk: false, material: 'baner-linkedin', typ: PNG },
    { plik: 'zaproszenie-teams.png', grupa: 'kv', opis: 'Tło spotkania online', pakiet: true, druk: false, material: 'zaproszenie-teams', typ: PNG },
    { plik: 'ksiega-znaku.pdf', grupa: 'kv', opis: 'Księga znaku – zasady używania logo (PDF)', pakiet: true, druk: false, material: 'ksiega-znaku', typ: PDF },
    { plik: 'wizytowka.pdf', grupa: 'druk', opis: 'Wizytówka 85 × 55 mm do druku – przód i tył, spad 3 mm, linie cięcia', pakiet: true, druk: true, material: 'wizytowka', typ: PDF },
    { plik: 'papier-firmowy.pdf', grupa: 'druk', opis: 'Papier firmowy A4 (PDF)', pakiet: true, druk: true, material: 'papier-firmowy', typ: PDF },
    { plik: 'naklejka.pdf', grupa: 'druk', opis: 'Naklejka okrągła Ø 60 mm ze spadem i konturem wykrojnika', pakiet: true, druk: true, material: 'naklejka', typ: PDF },
  );
  return pliki;
}

/** Blokada pliku: okres próbny (eksport po opłaceniu hostingu) → Pakiet → zgoda TMview (pliki do druku). */
export function blokadaPliku(p: OpisPliku, wersja: WersjaMarkiKonta, tmview: boolean): PlikMarki['blokada'] | undefined {
  if (wersja === 'proba') return 'PROBA';
  if (p.pakiet && wersja !== 'pakiet') return 'PAKIET_WYMAGANY';
  if (p.druk && !tmview) return 'TMVIEW_WYMAGANY';
  return undefined;
}

export function listaPlikow(m: Marka | null, wersja: WersjaMarkiKonta, tmview: boolean): PlikMarki[] {
  if (!m) return [];
  return katalogPlikow(m).map((p) => {
    const blokada = blokadaPliku(p, wersja, tmview);
    return { plik: p.plik, grupa: p.grupa, opis: p.opis, dostepny: !blokada, ...(blokada ? { blokada } : {}), ...(p.material ? { material: p.material } : {}) };
  });
}
