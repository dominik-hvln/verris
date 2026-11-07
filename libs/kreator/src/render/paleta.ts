import type { Paleta } from '../model.ts';
import { czyCiemny, dopasujKontrast, formatKontrastu, kontrastWcag, mieszaj } from './kolor.ts';

/** Kolory jednego tła sekcji – każdy tekst ma sprawdzony kontrast z tłem i z kartą na tym tle. */
export interface KontekstKolorow {
  tlo: string;
  karta: string;
  tekst: string;
  tekst2: string;
  akcentTekst: string;
  linia: string;
  /** Obramowanie pól formularza i elementów UI – min. 3:1 (WCAG 1.4.11). */
  ramka: string;
  przycisk: string;
  przyciskTekst: string;
  fokus: string;
  ciemny: boolean;
}

export type NazwaTla = 'domyslne' | 'powierzchnia' | 'ciemne' | 'akcent';

export interface KoloryStrony {
  paleta: Paleta;
  konteksty: Record<NazwaTla, KontekstKolorow>;
  ostrzezenia: string[];
}

const TEKST = 4.5;
const UI = 3;

/**
 * Buduje kolory czterech teł sekcji z palety. Gdy paleta (np. z AI) nie spełnia WCAG AA,
 * koryguje kolor tekstu (jasność w OKLCH) i zapisuje ostrzeżenie zrozumiałe dla klienta.
 */
export function budujKolory(wejscie: Paleta): KoloryStrony {
  const ostrzezenia: string[] = [];
  const p: Paleta = { ...wejscie };
  const popraw = (klucz: keyof Paleta, tla: string[], opisTla: string, min = TEKST) => {
    const przed = p[klucz];
    const po = dopasujKontrast(przed, tla, min);
    if (po !== przed.toUpperCase()) {
      const k = Math.min(...tla.map((t) => kontrastWcag(przed, t)));
      ostrzezenia.push(`Kontrast: kolor „${klucz}” ${przed} na tle „${opisTla}” ma ${formatKontrastu(k)} – poprawiono na ${po} (wymagane ${min}:1).`);
      p[klucz] = po;
    }
  };

  const kartaJasna = (t: string) => (czyCiemny(t) ? mieszaj(t, '#FFFFFF', 0.07) : mieszaj(t, '#FFFFFF', 0.55));
  // Korekta bazowej palety – te pary widać na każdej stronie.
  popraw('tekst', [p.tlo, p.powierzchnia, kartaJasna(p.tlo)], 'tlo/powierzchnia');
  popraw('tekstPrzygaszony', [p.tlo, p.powierzchnia, kartaJasna(p.tlo)], 'tlo/powierzchnia');
  popraw('akcentTekst', [p.tlo, p.powierzchnia, kartaJasna(p.tlo)], 'tlo/powierzchnia');
  popraw('naAkcencie', [p.akcent], 'akcent');
  popraw('naCiemnym', [p.ciemne, kartaJasna(p.ciemne)], 'ciemne');

  const zbuduj = (nazwa: NazwaTla, tlo: string, tekst: string, tekst2Baza: string, akcentKandydaci: string[], przycisk: string, przyciskTekst: string): KontekstKolorow => {
    const karta = kartaJasna(tlo);
    const tla = [tlo, karta];
    const t = dopasujKontrast(tekst, tla, TEKST);
    const t2 = dopasujKontrast(tekst2Baza, tla, TEKST);
    const akcBaza = [...akcentKandydaci].sort((a, b) => kontrastWcag(b, tlo) - kontrastWcag(a, tlo))[0] ?? tekst;
    const akc = dopasujKontrast(akcBaza, tla, TEKST);
    const pt = dopasujKontrast(przyciskTekst, [przycisk], TEKST);
    if (pt !== przyciskTekst.toUpperCase()) {
      ostrzezenia.push(`Kontrast: tekst przycisku na tle „${nazwa}” poprawiono na ${pt} (wymagane ${TEKST}:1).`);
    }
    return {
      tlo,
      karta,
      tekst: t,
      tekst2: t2,
      akcentTekst: akc,
      linia: mieszaj(tlo, t, 0.16),
      ramka: dopasujKontrast(mieszaj(tlo, t, 0.45), tla, UI),
      przycisk,
      przyciskTekst: pt,
      fokus: dopasujKontrast(akc, [tlo], UI),
      ciemny: czyCiemny(tlo),
    };
  };

  const przyciskNaTle = (tlo: string): [string, string] => {
    if (kontrastWcag(p.akcent, tlo) >= UI) return [p.akcent, p.naAkcencie];
    // Akcent zlewa się z tłem (np. akcent = kolor ciemnej sekcji) – przycisk w kolorze tekstu.
    const tekstTla = czyCiemny(tlo) ? (czyCiemny(p.naCiemnym) ? '#FFFFFF' : p.naCiemnym) : p.tekst;
    return [tekstTla, tlo];
  };

  const [pd, pdt] = przyciskNaTle(p.tlo);
  const [pp, ppt] = przyciskNaTle(p.powierzchnia);
  const [pc, pct] = przyciskNaTle(p.ciemne);
  const [pa, pat] = kontrastWcag(p.ciemne, p.akcent) >= UI ? [p.ciemne, p.naCiemnym] : [p.naAkcencie, p.akcent];

  const konteksty: Record<NazwaTla, KontekstKolorow> = {
    domyslne: zbuduj('domyslne', p.tlo, p.tekst, p.tekstPrzygaszony, [p.akcentTekst], pd, pdt),
    powierzchnia: zbuduj('powierzchnia', p.powierzchnia, p.tekst, p.tekstPrzygaszony, [p.akcentTekst], pp, ppt),
    ciemne: zbuduj('ciemne', p.ciemne, p.naCiemnym, mieszaj(p.naCiemnym, p.ciemne, 0.24), [p.akcent, p.akcentTekst], pc, pct),
    akcent: zbuduj('akcent', p.akcent, p.naAkcencie, mieszaj(p.naAkcencie, p.akcent, 0.18), [p.naAkcencie], pa, pat),
  };
  return { paleta: p, konteksty, ostrzezenia };
}

/** Deklaracje custom properties jednego kontekstu (na :root albo klasie tła sekcji). */
export function zmienneKontekstu(k: KontekstKolorow): string {
  return [
    `--s-tlo:${k.tlo}`,
    `--s-karta:${k.karta}`,
    `--s-tekst:${k.tekst}`,
    `--s-tekst2:${k.tekst2}`,
    `--s-akc:${k.akcentTekst}`,
    `--s-linia:${k.linia}`,
    `--s-ramka:${k.ramka}`,
    `--s-btn:${k.przycisk}`,
    `--s-btn-t:${k.przyciskTekst}`,
    `--s-fokus:${k.fokus}`,
    `color-scheme:${k.ciemny ? 'dark' : 'light'}`,
  ].join(';');
}
