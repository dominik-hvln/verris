import { z } from 'zod';
import { Paleta } from '../model.ts';
import { CHARAKTERY_PALET } from '../style/kolory.ts';

/**
 * Verris Kreator marki – model marki (paczka 130, decyzja właściciela 2026-11-19: od razu pełny zakres, bez MVP).
 *
 * Zasada: logo to WEKTOR Z PARAMETRÓW, nie obraz. Sygnet = rodzina kształtów z biblioteki (`sygnety/`) + parametry
 * (deterministyczny generator) albo symbol od AI / wgrany plik po walidacji (`walidator-svg.ts`). Znak słowny = tekst
 * z kroju z KATALOG_FONTOW zamieniony na krzywe po stronie serwera (kształtowanie z kerningiem – API, fontkit).
 * Kolory: dwa kanały – `currentColor` (główny) i akcent (`var(--akcent)` / atrybut podstawiany przy eksporcie), więc
 * jedna definicja daje warianty kolor / jednobarwny / negatyw / biały.
 *
 * Koncepcja i uzasadnienia: dokument projektu „claude/kreator-marki-koncepcja.md”.
 * Ten plik jest KONTRAKTEM dla wszystkich części (biblioteka, AI, API, panel, kreator stron) – zmiany tylko
 * zgodne wstecz albo z podbiciem WERSJA_MODELU_MARKI i migracją w `migrujMarke`.
 */
export const WERSJA_MODELU_MARKI = 1;

const tekst = (max: number) => z.string().trim().min(1).max(max);
const tekstOpc = (max: number) => z.string().trim().max(max).optional();
const Kolor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

/** Skąd marka: nowa z briefu, odświeżenie istniejącego logo, Key Visual pod wgrane logo (logo zostaje bez zmian). */
export const ZRODLA_MARKI = ['nowa', 'odswiezenie', 'wgrane'] as const;
export type ZrodloMarki = (typeof ZRODLA_MARKI)[number];

/** Rodzaj znaku wybrany w briefie. */
export const RODZAJE_ZNAKU = ['znak-i-napis', 'napis', 'monogram'] as const;
export type RodzajZnaku = (typeof RODZAJE_ZNAKU)[number];

/** Cechy charakteru (do 3 w briefie) – zamknięta lista, żeby AI i reguły miały wspólny słownik. */
export const CECHY_MARKI = [
  'spokojna', 'energiczna', 'elegancka', 'przyjazna', 'nowoczesna', 'klasyczna', 'rzemieslnicza', 'techniczna',
  'luksusowa', 'zabawna', 'ekspercka', 'lokalna', 'naturalna', 'odwazna', 'minimalistyczna', 'ciepla',
] as const;
export type CechaMarki = (typeof CECHY_MARKI)[number];

/** Brief „Nowa marka” (i dane wejściowe odświeżenia). Treści klienta = dane, nie polecenia (AI dostaje je w <brief>). */
export const BriefMarki = z.object({
  nazwa: tekst(60),
  /** Podpis pod nazwą, np. „Biuro rachunkowe” – opcjonalny. */
  podpis: tekstOpc(60),
  branza: tekst(80),
  /** Jedno zdanie: czym się firma zajmuje i dla kogo. */
  opis: tekst(240),
  rodzaj: z.enum(RODZAJE_ZNAKU).default('znak-i-napis'),
  cechy: z.array(z.enum(CECHY_MARKI)).max(3).default([]),
  /** Barwy lubiane / odrzucone (0–359, OKLCH h) – z wybieraka w panelu, nie z wolnego tekstu. */
  barwyLubiane: z.array(z.number().int().min(0).max(359)).max(3).default([]),
  barwyOdrzucone: z.array(z.number().int().min(0).max(359)).max(3).default([]),
  /** Dodatkowe uwagi klienta (np. „bez zielonego”, „kojarzy nam się łódka”). */
  uwagi: tekstOpc(300),
});
export type BriefMarki = z.infer<typeof BriefMarki>;

/** Parametry rodziny sygnetu: liczby całkowite w zakresach z katalogu rodziny (`sygnety/katalog.ts`). */
export const ParametrySygnetu = z.record(z.string().regex(/^[a-z][a-z0-9]{0,11}$/), z.number().int().min(-360).max(360));
export type ParametrySygnetu = z.infer<typeof ParametrySygnetu>;

/** Sygnet: z biblioteki (rodzina + parametry + ziarno), od AI albo wgrany – oba po walidacji i normalizacji. */
export const Sygnet = z.discriminatedUnion('typ', [
  z.object({
    typ: z.literal('biblioteka'),
    rodzina: z.string().regex(/^[a-z0-9-]{2,40}$/),
    parametry: ParametrySygnetu,
    /** Litera/litery dla rodzin monogramowych (1–2 znaki z nazwy). */
    litery: z.string().max(2).optional(),
    ziarno: z.number().int().min(0).max(2 ** 31 - 1).default(0),
  }),
  z.object({
    typ: z.enum(['ai', 'wgrany']),
    /** SVG po `walidujSvgSygnetu` – viewBox 0 0 100 100, tylko ścieżki, kolory currentColor / akcent. */
    svg: z.string().max(40_000),
  }),
  /** Marka „sam napis” – bez sygnetu. */
  z.object({ typ: z.literal('brak') }),
]);
export type Sygnet = z.infer<typeof Sygnet>;

export const STYLE_NAPISU = ['jeden', 'dwa', 'wersaliki', 'male', 'rozstrzelony'] as const;
export const UKLADY_LOGO = ['poziomy', 'pionowy', 'sygnet', 'napis'] as const;
export type UkladLogo = (typeof UKLADY_LOGO)[number];

export const Napis = z.object({
  /** Rodzina z KATALOG_FONTOW (czyFontWKatalogu). */
  font: tekst(60),
  waga: z.number().int().min(100).max(900).default(600),
  styl: z.enum(STYLE_NAPISU).default('jeden'),
  /** Rozstrzelenie w tysięcznych em (−50…400). */
  rozstrzelenie: z.number().int().min(-50).max(400).default(0),
  /** Podpis pod napisem (z briefu) – w logo tylko powyżej minimalnego rozmiaru. */
  podpis: z.boolean().default(true),
});
export type Napis = z.infer<typeof Napis>;

/** Kolory marki: główny (znak i napis), akcent (drugi kanał sygnetu), akcent jasny (na kolorze głównym/ciemnym). */
export const KoloryMarki = z.object({
  glowny: Kolor,
  akcent: Kolor,
  akcentJasny: Kolor,
  /** Paleta strony w schemacie Motyw.paleta – z `generujPalete` + korekta kontrastu (style/kolory.ts). */
  paleta: Paleta,
  barwa: z.number().int().min(0).max(359),
  charakter: z.enum(CHARAKTERY_PALET),
});
export type KoloryMarki = z.infer<typeof KoloryMarki>;

/** Projekt logo – wszystko, co potrzeba do deterministycznego renderu (bez plików). */
export const ProjektLogo = z.object({
  sygnet: Sygnet,
  napis: Napis,
  kolory: KoloryMarki,
  /** Układ domyślny (pozostałe warianty generowane zawsze). */
  uklad: z.enum(UKLADY_LOGO).default('poziomy'),
  /** Fonty strony/materiałów: nagłówki i tekst (KATALOG_FONTOW). */
  fonty: z.object({ naglowki: tekst(60), tekst: tekst(60) }),
});
export type ProjektLogo = z.infer<typeof ProjektLogo>;

/** Kierunek z serii propozycji (wynik AI po walidacji albo zamiennik serwera) – projekt + uzasadnienie. */
export const KierunekMarki = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  projekt: ProjektLogo,
  /** Jedno zdanie, dlaczego ten kierunek (≤ 20 słów). */
  dlaczego: tekstOpc(200),
  /** Pochodzenie znaku – „Symbol od AI – sprawdzony walidatorem” w panelu. */
  zrodloZnaku: z.enum(['biblioteka', 'ai', 'zamiennik']).default('biblioteka'),
  /**
   * Paczka 134 – co przedstawia znak i z czym z briefu się łączy (nazwa, branża, skojarzenie), ≤ 25 słów,
   * np. „Litera L złożona z toru bieżni – Lubuski, sport, ruch”. Pokazywane w panelu przy propozycji.
   */
  koncepcja: tekstOpc(220),
});
export type KierunekMarki = z.infer<typeof KierunekMarki>;

/** Krótka strategia marki z serii (AI): grupa, cecha, skojarzenie – do 40 słów. */
export const StrategiaMarki = z.object({ grupa: tekstOpc(120), cecha: tekstOpc(120), skojarzenie: tekstOpc(120) });

/** Materiały Key Visual (Pakiet marki rozszerza listę). */
export const MATERIALY_KV = [
  'wzor', 'post', 'story', 'okladka-facebook', 'baner-linkedin', 'wizytowka', 'papier-firmowy', 'stopka-email',
  'favicon', 'ksiega-znaku', 'zaproszenie-teams', 'naklejka',
] as const;
export type MaterialKv = (typeof MATERIALY_KV)[number];

export const UstawieniaKv = z.object({
  /** Gęstość wzoru z sygnetu. */
  wzor: z.enum(['bez', 'rzadki', 'gesty']).default('rzadki'),
  /** Hasło na grafiki (posty, okładki). */
  haslo: tekstOpc(80),
  /** Zdjęcie w KV (nigdy w logo) – identyfikator zasobu z biblioteki kreatora stron (KreatorZasob). */
  zdjecieZasobId: z.string().max(40).optional(),
  tloCiemne: z.boolean().default(false),
});
export type UstawieniaKv = z.infer<typeof UstawieniaKv>;

/** Dane osobowe do wizytówki i stopki – podaje klient, każdy użytkownik może je zmienić. */
export const DaneKontaktoweMarki = z.object({
  imie: tekstOpc(80),
  stanowisko: tekstOpc(80),
  telefon: z.string().regex(/^\+?[0-9 ]{6,20}$/).optional(),
  email: z.string().email().max(120).optional(),
  www: z.string().max(120).optional(),
  adres: tekstOpc(160),
});
export type DaneKontaktoweMarki = z.infer<typeof DaneKontaktoweMarki>;

/** Zgody i oświadczenia (prawo do wgranego logo, sprawdzenie w TMview przed plikami do druku). */
export const ZgodyMarki = z.object({
  oswiadczeniePraw: z.string().datetime().optional(),
  sprawdzilemTmview: z.string().datetime().optional(),
});

/** Marka zapisana na koncie (JSON w bazie; pliki generowane przy zapisie/eksporcie, nie przechowywane w modelu). */
export const Marka = z.object({
  wersjaModelu: z.literal(WERSJA_MODELU_MARKI),
  zrodlo: z.enum(ZRODLA_MARKI),
  brief: BriefMarki,
  projekt: ProjektLogo,
  strategia: StrategiaMarki.optional(),
  kv: UstawieniaKv.default({ wzor: 'rzadki', tloCiemne: false }),
  kontakt: DaneKontaktoweMarki.default({}),
  zgody: ZgodyMarki.default({}),
});
export type Marka = z.infer<typeof Marka>;

/** Migracja starszych zapisów (na razie jedna wersja). */
export function migrujMarke(dane: unknown): Marka {
  return Marka.parse(dane);
}
