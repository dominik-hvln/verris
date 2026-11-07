/**
 * Pomocnicze funkcje testów renderera (nie trafiają do eksportu paczki). Parser znaczników jest celowo
 * prosty – renderer generuje HTML w jednym stylu (atrybuty w cudzysłowach, bez komentarzy w treści).
 */
import { KATALOG_EFEKTOW, KATALOG_WARIANTOW } from '../katalog.ts';
import { walidujStrone, type Sekcja, type Strona, type StronaWejscie, type TypSekcji } from '../model.ts';
import type { WersjaKreatora } from '../plany.ts';
import { PRZYKLAD_CERAMIKA } from '../przyklady/ceramika.ts';
import { PRZYKLAD_KSIEGOWA } from '../przyklady/ksiegowa.ts';
import { PRZYKLAD_SALON } from '../przyklady/salon.ts';
import { PRZYKLAD_STUDIO } from '../przyklady/studio.ts';
import { renderujStrone, type OpcjeRenderu, type WynikRenderu } from './index.ts';

export const PRZYKLADY: Record<string, StronaWejscie> = {
  salon: PRZYKLAD_SALON,
  ksiegowa: PRZYKLAD_KSIEGOWA,
  ceramika: PRZYKLAD_CERAMIKA,
  studio: PRZYKLAD_STUDIO,
};

/** Minimalne dane każdego typu sekcji (fikcyjne) – do modelu ze wszystkimi wariantami. */
const DANE: Record<TypSekcji, Record<string, unknown>> = {
  hero: { nadtytul: 'Nadtytuł', naglowek: 'Nagłówek główny strony', podtytul: 'Podtytuł', przyciski: [{ etykieta: 'Kontakt', cel: '#kontakt-podzielony' }], fakty: [{ etykieta: 'Godziny', wartosc: 'pn–pt 9–17' }] },
  oferta: { naglowek: 'Oferta', wstep: 'Wstęp', pozycje: [{ tytul: 'Usługa A', opis: 'Opis', cena: 'od 100 zł', ikona: 'check' }, { tytul: 'Usługa B', cena: 'od 200 zł' }, { tytul: 'Usługa C' }] },
  cennik: {
    naglowek: 'Cennik',
    pakiety: [
      { nazwa: 'Miesięcznie', cenaBrutto: 49, cenaNetto: 39.84, okres: 'miesiac', cechy: ['Cecha 1', 'Cecha 2'] },
      { nazwa: 'Rocznie', cenaBrutto: 490, okres: 'rok', cechy: ['Cecha 1'], wyrozniony: true },
      { nazwa: 'Indywidualnie', cenaBrutto: null, cechy: ['Cecha 3'] },
    ],
    uwaga: 'Uwaga do cennika',
  },
  galeria: { naglowek: 'Galeria', obrazy: [{ alt: 'Jeden' }, { alt: 'Dwa' }, { alt: 'Trzy' }, { alt: 'Cztery' }, { alt: 'Pięć' }, { alt: 'Sześć' }] },
  zespol: { naglowek: 'Zespół', osoby: [{ imie: 'Anna', rola: 'Właścicielka', opis: 'Opis' }, { imie: 'Jan' }, { imie: 'Ewa' }] },
  opinie: { naglowek: 'Opinie', wpisy: [{ autor: 'Klient A', tresc: 'Treść opinii A' }, { autor: 'Klient B', tresc: 'Treść opinii B', zrodloUrl: 'https://www.google.com/maps' }] },
  faq: { naglowek: 'Pytania', pytania: [{ pytanie: 'Pytanie 1?', odpowiedz: 'Odpowiedź 1' }, { pytanie: 'Pytanie 2?', odpowiedz: 'Odpowiedź 2' }] },
  kroki: { naglowek: 'Kroki', kroki: [{ tytul: 'Krok 1', opis: 'Opis', czas: '1 dzień' }, { tytul: 'Krok 2' }, { tytul: 'Krok 3' }] },
  onas: { naglowek: 'O nas', akapity: ['Akapit pierwszy.', 'Akapit drugi.'], wyrozniki: [{ tytul: 'Wyróżnik', opis: 'Opis' }] },
  kontakt: { naglowek: 'Kontakt', pola: ['imie', 'email', 'telefon', 'usluga', 'termin', 'firma', 'wiadomosc'] },
  cta: { naglowek: 'Wezwanie', tekst: 'Tekst', przyciski: [{ etykieta: 'Zadzwoń', cel: 'tel:+48600000000' }] },
  produkty: { naglowek: 'Produkty', produkty: [{ nazwa: 'Produkt A', cenaBrutto: 10 }, { nazwa: 'Produkt B', cenaBrutto: 20, dostepnosc: 'ostatnie' }] },
  blog: { naglowek: 'Blog', wpisy: [{ tytul: 'Wpis', lead: 'Lead wpisu', data: '2026-11-01', slug: 'wpis', czasCzytania: 3 }] },
};

/** Model z każdym wariantem każdego typu sekcji i wszystkimi efektami (pokrycie całego CSS i JS). */
export function wszystkieWarianty(): StronaWejscie {
  // model dopuszcza 30 sekcji na podstronę – typy dzielimy między stronę główną i podstronę „więcej”
  const naGlownej: TypSekcji[] = ['hero', 'oferta', 'cennik', 'kontakt', 'faq', 'opinie'];
  const sekcje = (glowna: boolean) =>
    Object.entries(KATALOG_WARIANTOW)
      .filter(([typ]) => naGlownej.includes(typ as TypSekcji) === glowna)
      .flatMap(([typ, warianty]) =>
        warianty.map((w) => ({ id: w.id, typ, wariant: w.id, wMenu: w.id === 'kontakt-podzielony' ? 'Kontakt' : undefined, dane: DANE[typ as TypSekcji] }) as unknown as Sekcja),
      );
  return {
    ...structuredClone(PRZYKLAD_SALON),
    motyw: { ...structuredClone(PRZYKLAD_SALON.motyw), efekty: KATALOG_EFEKTOW.map((e) => e.id) },
    strony: [
      { slug: '', tytul: 'Start', sekcje: sekcje(true) },
      { slug: 'wiecej', tytul: 'Więcej', sekcje: sekcje(false) },
      { slug: 'blog/wpis', tytul: 'Wpis', sekcje: [{ id: 'tresc-wpisu', typ: 'onas', wariant: 'onas-manifest', dane: DANE.onas } as unknown as Sekcja] },
    ],
  };
}

export const ADRES = 'https://www.przyklad.pl';
export const DATA = '2026-11-07T12:00:00Z';

export function model(w: StronaWejscie): Strona {
  const r = walidujStrone(w);
  if (!r.ok) throw new Error(r.bledy.join('\n'));
  return r.strona;
}

export function render(w: StronaWejscie, wersja: WersjaKreatora, opcje: Partial<OpcjeRenderu> = {}): WynikRenderu {
  return renderujStrone(model(w), { wersja, tryb: 'publikacja', bazaFontow: 'assets/fonty', adresStrony: ADRES, dataGeneracji: DATA, ...opcje });
}

export function plik(w: WynikRenderu, sciezka: string): string {
  const p = w.pliki.find((x) => x.sciezka === sciezka);
  if (!p) throw new Error(`Brak pliku ${sciezka} (są: ${w.pliki.map((x) => x.sciezka).join(', ')})`);
  return p.tresc;
}

export function htmle(w: WynikRenderu): { sciezka: string; tresc: string }[] {
  return w.pliki.filter((p) => p.sciezka.endsWith('.html'));
}

/** Kopia modelu, w której każdy obraz ma plik (renderer wstawia <img> zamiast ramki zastępczej). */
export function zeZdjeciami(w: StronaWejscie): StronaWejscie {
  const kopia = structuredClone(w);
  let n = 0;
  const odwiedz = (x: unknown): void => {
    if (Array.isArray(x)) return x.forEach(odwiedz);
    if (!x || typeof x !== 'object') return;
    const o = x as Record<string, unknown>;
    if (typeof o.alt === 'string' && ('podpis' in o || 'proporcje' in o || 'opisDoWyszukania' in o)) {
      o.zrodlo = 'wlasne';
      o.url = `assets/zdjecia/zdjecie-${++n}.jpg`;
    }
    Object.values(o).forEach(odwiedz);
  };
  odwiedz(kopia);
  return kopia;
}

export interface Znacznik {
  nazwa: string;
  atr: Record<string, string>;
  surowy: string;
}

const ZNACZNIK = /<([a-zA-Z][\w-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*\/?>/g;
const ATRYBUT = /([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;

export function znaczniki(html: string): Znacznik[] {
  const wynik: Znacznik[] = [];
  for (const m of html.matchAll(ZNACZNIK)) {
    const atr: Record<string, string> = {};
    for (const a of (m[2] ?? '').matchAll(ATRYBUT)) atr[a[1]!.toLowerCase()] = a[2] ?? a[3] ?? a[4] ?? '';
    wynik.push({ nazwa: m[1]!.toLowerCase(), atr, surowy: m[0] });
  }
  return wynik;
}

export function odEncji(t: string): string {
  return t
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Tekst widoczny (bez znaczników, z rozwiniętymi encjami). */
export function tekst(html: string): string {
  return odEncji(html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');
}

/** Zawartość wszystkich bloków JSON-LD (surowy tekst między znacznikami). */
export function blokiLd(html: string): string[] {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]!);
}

export function grafLd(html: string): Record<string, unknown>[] {
  const bloki = blokiLd(html);
  if (bloki.length !== 1) throw new Error(`Oczekiwano jednego bloku JSON-LD, jest ${bloki.length}`);
  const ld = JSON.parse(bloki[0]!) as { '@context': string; '@graph': Record<string, unknown>[] };
  return ld['@graph'];
}

export function typyLd(html: string): string[] {
  return grafLd(html).map((x) => String(x['@type']));
}

/** Fragment HTML znacznika <section id="…"> (do końca sekcji). */
export function sekcjaHtml(html: string, id: string): string | null {
  const start = html.indexOf(`<section id="${id}"`);
  if (start < 0) return null;
  return html.slice(start, html.indexOf('</section>', start) + 10);
}

/** Usuwa z CSS bloki @media (prefers-reduced-motion:reduce){…} (z zagnieżdżonymi klamrami). */
export function bezRedukcjiRuchu(css: string): { reszta: string; bloki: string[] } {
  const bloki: string[] = [];
  let reszta = css;
  for (;;) {
    const i = reszta.search(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{/);
    if (i < 0) break;
    let j = reszta.indexOf('{', i) + 1;
    let glebokosc = 1;
    while (glebokosc > 0 && j < reszta.length) {
      if (reszta[j] === '{') glebokosc++;
      else if (reszta[j] === '}') glebokosc--;
      j++;
    }
    bloki.push(reszta.slice(i, j));
    reszta = reszta.slice(0, i) + reszta.slice(j);
  }
  return { reszta, bloki };
}
