/**
 * Źródła asystenta www (1.11.2026) — JEDYNA wiedza, z której wolno mu odpowiadać:
 * cennik (Plan + AutoscalingPriceRule z bazy), specyfikacja, fakty o działaniu, artykuły bazy wiedzy CLIENT/ALL.
 * Odpowiedź modelu cytuje id źródeł; serwer odrzuca id spoza tej listy (przyjmijZrodla).
 */
import { FAKTY, faktProby } from './fakty.js';
import { SPECYFIKACJA } from './specyfikacja.js';

export interface Zrodlo {
  id: string;
  tytul: string;
  url: string | null;
  tresc: string;
}

/** Źródło w odpowiedzi API (bez treści). */
export interface ZrodloPubliczne {
  id: string;
  tytul: string;
  url: string | null;
}

export const VAT = 0.23;

/** Netto z brutto (VAT 23%), zaokrąglone do grosza — ta sama zasada co lib/ceny na www. */
export function netto(brutto: number): number {
  return Math.round((brutto / (1 + VAT)) * 100) / 100;
}

/** Stawki netto mają więcej miejsc po przecinku (np. 0,001076) — zaokrąglenie do 6 miejsc. */
function nettoStawki(brutto: number): number {
  return Math.round((brutto / (1 + VAT)) * 1_000_000) / 1_000_000;
}

function zl(kwota: number): string {
  return kwota.toFixed(2).replace('.', ',');
}

function st(kwota: number): string {
  return String(kwota).replace('.', ',');
}

export interface DaneCennika {
  hosting?: { miesiecznie: number; rocznie: number; trialDays: number } | null;
  poczta?: { miesiecznie: number; rocznie: number } | null;
  stawki: { cpu?: number; ram?: number; dysk?: number };
  /** Decyzja 6.11.2026 — kredyty na autoskalowanie przy pierwszym zakupie hostingu (zł brutto), z ustawień oferty. */
  kredytyStartowe?: { rocznie: number; miesiecznie: number; waznoscMiesiecy: number } | null;
}

/** Cennik jako jedno źródło (ceny brutto i netto policzone tu, model ich nie liczy). */
export function zrodloCennika(d: DaneCennika): Zrodlo {
  const linie: string[] = ['Ceny w złotych; brutto zawiera 23% VAT.'];
  if (d.hosting) {
    const h = d.hosting;
    const rabat = Math.floor((1 - h.rocznie / (h.miesiecznie * 12)) * 100);
    linie.push(
      `Hosting Verris z autoskalowaniem (jeden pakiet): miesięcznie ${zl(h.miesiecznie)} zł brutto (${zl(netto(h.miesiecznie))} zł netto); rocznie ${zl(h.rocznie)} zł brutto (${zl(netto(h.rocznie))} zł netto), czyli ok. ${zl(h.rocznie / 12)} zł brutto miesięcznie — ${rabat}% taniej niż 12 miesięcy. Ta sama cena przy odnowieniu.`,
    );
  }
  if (d.poczta) {
    const p = d.poczta;
    linie.push(
      `Sama poczta (bez hostingu strony): miesięcznie ${zl(p.miesiecznie)} zł brutto (${zl(netto(p.miesiecznie))} zł netto); rocznie ${zl(p.rocznie)} zł brutto (${zl(netto(p.rocznie))} zł netto). Klient z hostingiem ma pocztę w cenie hostingu.`,
    );
  }
  const s = d.stawki;
  if (s.cpu !== undefined || s.ram !== undefined || s.dysk !== undefined) {
    const czesci: string[] = [];
    if (s.cpu !== undefined) czesci.push(`procesor ${st(s.cpu)} zł brutto (${st(nettoStawki(s.cpu))} zł netto) za 1% CPU na godzinę (1 vCPU = 100%)`);
    if (s.ram !== undefined) czesci.push(`pamięć ${st(s.ram)} zł brutto (${st(nettoStawki(s.ram))} zł netto) za 1 GB RAM na godzinę`);
    if (s.dysk !== undefined) {
      const mies = s.dysk * 730;
      czesci.push(
        `dysk ponad 50 GB ${st(s.dysk)} zł brutto (${st(nettoStawki(s.dysk))} zł netto) za 1 GB na godzinę, czyli ok. ${zl(mies)} zł brutto (${zl(netto(mies))} zł netto) za 1 GB przez cały miesiąc (730 godzin)`,
      );
    }
    linie.push(`Dodatkowa moc ponad pakiet (tylko za czas użycia, bloki 15 minut): ${czesci.join('; ')}.`);
  }
  const k = d.kredytyStartowe;
  if (k && (k.rocznie > 0 || k.miesiecznie > 0)) {
    const czesci: string[] = [];
    if (k.rocznie > 0) czesci.push(`${zl(k.rocznie)} zł przy planie rocznym`);
    if (k.miesiecznie > 0) czesci.push(`${zl(k.miesiecznie)} zł przy planie miesięcznym`);
    linie.push(
      `Przy pierwszym zakupie hostingu darmowe kredyty na autoskalowanie: ${czesci.join(', ')} (kwoty brutto, nie podlegają VAT ani fakturze). Tylko na dopłaty za dodatkową moc, ważne ${k.waznoscMiesiecy} miesięcy od przyznania (po opłaceniu zamówienia); bez zwrotu przy usunięciu konta. Rabatu na start nie ma — pierwszy okres kosztuje tyle co odnowienie.`,
    );
  }
  linie.push('Domeny: cena rejestracji i odnowienia w cenniku domen w panelu (nie podawaj kwot domen).');
  return { id: 'cennik', tytul: 'Cennik', url: 'https://verris.pl/cennik', tresc: linie.join('\n') };
}

export function zrodlaSpecyfikacji(): Zrodlo[] {
  return SPECYFIKACJA.map((s) => ({
    id: `spec-${s.id}`,
    tytul: `Specyfikacja: ${s.tytul}`,
    url: `https://verris.pl/specyfikacja#${s.id}`,
    tresc: s.wiersze.map(([p, w]) => `${p}: ${w}`).join('\n'),
  }));
}

export function zrodlaFaktow(trialDays: number, limitWysylkiProby: number): Zrodlo[] {
  return [...FAKTY, faktProby(trialDays, limitWysylkiProby)].map((f) => ({ id: f.id, tytul: f.tytul, url: f.url, tresc: f.tresc }));
}

export interface FragmentWiedzy {
  docId: string;
  title: string;
  content: string;
  sourceRef: string | null;
}

/** Artykuły bazy wiedzy (tylko CLIENT/ALL — filtr robi KnowledgeBaseService.retrieve). Link dla artykułów z pomoc.verris.pl. */
export function zrodlaWiedzy(fragmenty: FragmentWiedzy[]): Zrodlo[] {
  const wg = new Map<string, Zrodlo>();
  for (const f of fragmenty) {
    const id = `kb-${f.docId}`;
    const slug = f.sourceRef?.startsWith('kb-cms:') ? f.sourceRef.slice('kb-cms:'.length) : null;
    const istn = wg.get(id);
    if (istn) {
      istn.tresc += `\n${f.content}`;
      continue;
    }
    wg.set(id, {
      id,
      tytul: f.title,
      url: slug ? `https://pomoc.verris.pl/a/${encodeURIComponent(slug)}` : 'https://pomoc.verris.pl',
      tresc: f.content,
    });
  }
  return [...wg.values()];
}

/** Blok źródeł do promptu: każde źródło z id, które model ma cytować. */
export function blokZrodel(zrodla: Zrodlo[]): string {
  return zrodla.map((z) => `<zrodlo id="${z.id}" tytul="${z.tytul.replace(/"/g, "'")}">\n${z.tresc}\n</zrodlo>`).join('\n\n');
}

/** Zostawia tylko id z listy dostarczonych źródeł (bez powtórzeń, w kolejności modelu). */
export function przyjmijZrodla(idModelu: unknown, dostepne: Zrodlo[]): ZrodloPubliczne[] {
  if (!Array.isArray(idModelu)) return [];
  const wg = new Map(dostepne.map((z) => [z.id, z]));
  const wynik: ZrodloPubliczne[] = [];
  const byly = new Set<string>();
  for (const id of idModelu) {
    if (typeof id !== 'string' || byly.has(id)) continue;
    const z = wg.get(id);
    if (!z) continue;
    byly.add(id);
    wynik.push({ id: z.id, tytul: z.tytul, url: z.url });
  }
  return wynik;
}
