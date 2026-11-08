import { poleTekstowe, wartoscPod } from '../edycja.ts';
import type { Sekcja, Strona } from '../model.ts';
import { esc } from './esc.ts';
import type { EdycjaStrony, KontekstPodstrony } from './kontekst.ts';

/**
 * Atrybuty trybu „edycja na stronie” (paczka 122). Tylko podgląd z `opcje.edycja` – publikacja i ZIP nigdy ich nie
 * mają (test edycja.spec.ts). Ścieżki wskazują model z edytora (przed dopasowaniem do planu), więc sekcje Pro
 * usunięte w wersji bez Pro nie przesuwają indeksów.
 */

export function przygotujEdycje(model: Strona): EdycjaStrony {
  return {
    model,
    strony: new Map(model.strony.map((p, i) => [p.slug, { i, sekcje: new Map(p.sekcje.map((s, j) => [s.id, j])) }])),
  };
}

/** `strony.<i>.sekcje.<j>` sekcji w modelu z edytora; null poza trybem edycji. */
export function sciezkaSekcji(k: KontekstPodstrony, sek: Pick<Sekcja, 'id'>): string | null {
  const p = k.s.edycja?.strony.get(k.podstrona.slug);
  const j = p?.sekcje.get(sek.id);
  return p && j !== undefined ? `strony.${p.i}.sekcje.${j}` : null;
}

/** `strony.<i>` bieżącej podstrony. */
export function sciezkaPodstrony(k: KontekstPodstrony): string | null {
  const p = k.s.edycja?.strony.get(k.podstrona.slug);
  return p ? `strony.${p.i}` : null;
}

/**
 * ` data-k="…" data-k-max="…"` dla tekstu pod ścieżką – tylko gdy to pole edytowalne w podglądzie (edycja.ts)
 * i w modelu jest tekst. Limit ze schematu zod (jedno źródło z walidacją).
 */
export function atrTekstu(k: KontekstPodstrony, sciezka: string | null): string {
  const e = k.s.edycja;
  if (!e || !sciezka) return '';
  const pole = poleTekstowe(e.model, sciezka);
  if (!pole || typeof wartoscPod(e.model, sciezka) !== 'string') return '';
  return ` data-k="${esc(sciezka)}" data-k-max="${pole.max}"${pole.wiele ? ' data-k-wiele="1"' : ''}`;
}

/** Fabryka atrybutów dla pól sekcji: `ak('dane.naglowek')`, `ak('wMenu')`. Poza edycją zwraca ''. */
export function edytowalne(k: KontekstPodstrony, sek: Pick<Sekcja, 'id'>): (wzgledna: string) => string {
  const baza = k.s.edycja ? sciezkaSekcji(k, sek) : null;
  return (wzgledna) => (baza ? atrTekstu(k, `${baza}.${wzgledna}`) : '');
}

/** Pełna ścieżka pola sekcji (do obrazów i pól otwieranych formularzem); null poza edycją. */
export function sciezkaPola(k: KontekstPodstrony, sek: Pick<Sekcja, 'id'>, wzgledna: string): string | null {
  const baza = sciezkaSekcji(k, sek);
  return baza ? `${baza}.${wzgledna}` : null;
}

/** Element otwierający pole w formularzu edytora (np. cena liczbowa – nie piszemy jej w podglądzie). */
export function atrFormularza(k: KontekstPodstrony, sek: Pick<Sekcja, 'id'>, wzgledna: string): string {
  const s = k.s.edycja ? sciezkaPola(k, sek, wzgledna) : null;
  return s ? ` data-k-formularz="${esc(s)}"` : '';
}

/** Tekst wielowierszowy w edycji: jeden element z \n (CSS edycji: white-space: pre-line), zamiast akapitów. */
export function tekstWielowierszowy(atr: string, tekst: string, znacznik = 'p'): string {
  return `<${znacznik}${atr}>${esc(tekst)}</${znacznik}>`;
}

/**
 * Opcje obrazu ze ścieżką obiektu Obraz w modelu (obraz.ts dodaje `data-k-obraz` – część agenta zdjęć; kontrakt
 * paczki 122, pkt 3). Poza edycją opcje bez zmian.
 */
export function zeSciezkaObrazu<T extends object>(k: KontekstPodstrony, sek: Pick<Sekcja, 'id'>, wzgledna: string, opcje: T): T {
  const s = k.s.edycja ? sciezkaPola(k, sek, wzgledna) : null;
  return s ? ({ ...opcje, sciezka: s } as T) : opcje;
}
