import { z } from 'zod';
import { analizujSvgMarki, MAKS_SVG_FAVICONU, MAKS_SVG_LOGO } from './svg.ts';

/**
 * Marka na stronie z kreatora (paczka 130, koncepcja „Kreator marki” rozdz. 3.9) – MIGAWKA marki z konta zapisana
 * w modelu strony. Strona nie zmienia się sama po zmianie marki: nowsza wersja marki to propozycja aktualizacji
 * z podglądem (`porownajMarke` / `zastosujMarke` w zastosuj.ts), a do tego czasu strona pokazuje logo z migawki.
 *
 * Pole wypełnia WYŁĄCZNIE serwer (endpoint „zastosuj markę” z migawki dostawcy marki). AI go nie generuje i nie widzi
 * (ai/kompakt.ts – POLA_POZA_AI), zapis z edytora nie może go zmienić (API zostawia migawkę z bazy).
 * Plik bez importów z model.ts – model strony importuje ten schemat.
 */

const Kolor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

const svg = (maks: number) =>
  z
    .string()
    .max(maks)
    .superRefine((s, ctx) => {
      const w = analizujSvgMarki(s, maks);
      if (!w.ok) ctx.addIssue({ code: 'custom', message: `Niedozwolony plik SVG logo: ${w.bledy[0]}` });
    });

/** Plik marki poza SVG (favicon PNG, obraz OG): na hostingu klienta (assets/…) albo https. */
export const AdresPlikuMarki = z
  .string()
  .trim()
  .max(500)
  .regex(/^(assets\/|https:\/\/)[^\s"'<>\\]+$/, 'Adres pliku marki musi być względny (assets/…) albo https');

export const MarkaStrony = z.object({
  /** Identyfikator marki na koncie (tabela marek – kreator marki). */
  markaId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  /** Wersja marki w chwili zastosowania (porównanie z bieżącą = propozycja aktualizacji). */
  wersja: z.number().int().min(1).max(1_000_000),
  /** Nazwa firmy w logo (tekst alternatywny linku logo, nazwa w eksporcie). */
  nazwa: z.string().trim().min(1).max(80),
  /** Logo poziome (nagłówek, stopka) – kanały: `currentColor` = kolor główny, `var(--akcent)` = akcent. */
  logoPoziome: svg(MAKS_SVG_LOGO),
  logoPionowe: svg(MAKS_SVG_LOGO).optional(),
  /** Sam znak – nagłówek na wąskim ekranie. */
  sygnet: svg(MAKS_SVG_LOGO).optional(),
  /** Logo na ciemne tło (stopka, ciemny nagłówek). Brak = logo poziome w kolorze tekstu na ciemnym. */
  logoNegatyw: svg(MAKS_SVG_LOGO).optional(),
  favicon: svg(MAKS_SVG_FAVICONU),
  /** Favicon PNG (fallback dla przeglądarek bez SVG, apple-touch-icon) – plik wygenerowany przez kreator marki. */
  faviconPng: AdresPlikuMarki.optional(),
  /** Obraz OG z materiałów marki – gdy strona nie ma własnego `seo.obrazOg`. */
  obrazOg: AdresPlikuMarki.optional(),
  kolory: z.object({ glowny: Kolor, akcent: Kolor }),
  /** Co z migawki strona pokazuje (paleta i fonty trafiają od razu do `motyw`). */
  uzyj: z.object({ logo: z.boolean().default(true), favicon: z.boolean().default(true) }).default({ logo: true, favicon: true }),
});
export type MarkaStrony = z.infer<typeof MarkaStrony>;
