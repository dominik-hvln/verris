import type { WiadomoscAi, ZapytanieAi } from '../../ai/kontrakt.ts';
import { FRAZY_ZAKAZANE, oczyscTeksty, wyciagnijJson } from '../../ai/odczyt.ts';
import { CHARAKTERY_PALET } from '../../style/kolory.ts';
import { KoloryMarki, type BriefMarki } from '../model.ts';
import { koloryMarki } from '../kolory-marki.ts';

/**
 * Wspólne części operacji AI kreatora marki: zapytanie (z rodzajem modelu i opcjonalnym obrazem), odczyt JSON,
 * oczyszczanie typografii, frazy zakazane, ucieczka znaczników w danych klienta i rozwinięcie barwy do KoloryMarki.
 */

/** Zapytanie AI kreatora marki: jak w kreatorze stron + klasa modelu i obraz (analiza logo). */
export interface ZapytanieAiMarki extends ZapytanieAi {
  /** 'glowny' – model generacji (seria, odświeżenie, analiza, KV); 'tani' – model zmian (drobne zmiany). */
  klasaModelu: 'glowny' | 'tani';
  /**
   * Obraz do dołączenia przez API: blok `image` (base64 PNG) PRZED tekstem pierwszej wiadomości użytkownika
   * (https://platform.claude.com/docs/en/build-with-claude/vision). Biblioteka nie trzyma bajtów obrazu.
   */
  obraz?: { mediaType: 'image/png' };
}

/** Wynik odczytu operacji: dane albo błędy (do jednej rundy naprawy – `wiadomosciNaprawy` z ai/odczyt.ts). */
export type WynikAiMarki<T> = { ok: true; dane: T; ostrzezenia: string[] } | { ok: false; bledy: string[] };

/** Frazy zakazane w tekstach marki: obietnice prawne + frazesy (do tego FRAZY_ZAKAZANE kreatora stron). */
export const FRAZY_ZAKAZANE_MARKI: { wzor: RegExp; opis: string }[] = [
  { wzor: /\bunikal\p{L}*/iu, opis: '„unikalny” – znak nie jest badany pod kątem unikalności' },
  { wzor: /\boryginaln\p{L}* (?:znak|logo|sygnet)/iu, opis: '„oryginalny znak” – obietnica bez pokrycia' },
  { wzor: /\bzastrzeż\p{L}*|\bzastrzez\p{L}*/iu, opis: '„zastrzeżony” – znak nie jest zarejestrowany' },
  { wzor: /\bchronion\p{L}* (?:prawem|znakiem)|ochron\p{L}* prawn\p{L}*/iu, opis: '„chroniony prawem” – obietnica prawna' },
  { wzor: /gotow\p{L}* do rejestracji|do zarejestrowania od ręki/iu, opis: '„gotowy do rejestracji” – obietnica prawna' },
  { wzor: /sprawdzon\p{L}* (?:w|przez) (?:urz\p{L}*|uprp|euipo|tmview)/iu, opis: '„sprawdzony w urzędzie” – nikt go nie badał' },
  { wzor: /jedyn\p{L}* (?:taki|taka|takie) na (?:rynku|świecie)/iu, opis: '„jedyny na rynku” – obietnica bez pokrycia' },
  { wzor: /\bz pasją\b|najwyższ\p{L}* jakoś\p{L}*|profesjonalizm\p{L}*|wyjątkow\p{L}*/iu, opis: 'frazes – zastąp konkretem z briefu' },
  ...FRAZY_ZAKAZANE,
];

/** Opisy naruszeń w tekście (pusta lista = w porządku). */
export function naruszeniaTekstu(tekst: string): string[] {
  return FRAZY_ZAKAZANE_MARKI.filter((f) => f.wzor.test(tekst)).map((f) => f.opis);
}

/** Tekst od AI: typografia (pauza → półpauza, bez emoji), proste cudzysłowy → polskie, limit słów i znaków. */
export function tekstAi(tekst: unknown, maxSlow: number, maxZnakow = 400): string | undefined {
  if (typeof tekst !== 'string') return undefined;
  let t = oczyscTeksty(tekst).replace(/"([^"]+)"/g, '„$1”').replace(/!+/g, '.').replace(/\.{2,}/g, '.');
  const slowa = t.split(/\s+/).filter(Boolean);
  if (slowa.length > maxSlow) t = slowa.slice(0, maxSlow).join(' ').replace(/[,;:–-]+$/, '');
  t = t.slice(0, maxZnakow).trim();
  return t || undefined;
}

/** JSON z odpowiedzi (wspólne z kreatorem stron: płotki, tekst wokół) – obiekt albo błąd. */
export function jsonOdpowiedzi(tekst: string): { ok: true; dane: Record<string, unknown> } | { ok: false; blad: string } {
  const j = wyciagnijJson(tekst);
  if (!j.ok) return { ok: false, blad: j.blad };
  if (!j.dane || typeof j.dane !== 'object' || Array.isArray(j.dane)) return { ok: false, blad: '(korzeń): oczekiwany obiekt JSON' };
  return { ok: true, dane: j.dane as Record<string, unknown> };
}

/** Neutralizacja znaczników danych (<brief>, <polecenie>, <logo>, <marka>) w tekście od klienta. */
export function ucieczkaMarki(tekst: string): string {
  return tekst.replace(/<\s*\/?\s*(brief|polecenie|logo|marka|sekcja|strona)\b[^>]*>?/gi, (m) => m.replace(/</g, '&lt;').replace(/>/g, '&gt;'));
}

const przytnij = (s: string | undefined, max: number) => (s ?? '').trim().slice(0, max);

/** Brief marki w zapisie dla modelu (krótko, bez pól pustych) – zawsze wewnątrz <brief>. */
export function trescBriefuMarki(b: Partial<BriefMarki> & Pick<BriefMarki, 'nazwa'>): string {
  const linie = [`Nazwa: ${przytnij(b.nazwa, 60)}`];
  if (b.podpis?.trim()) linie.push(`Podpis: ${przytnij(b.podpis, 60)}`);
  if (b.branza?.trim()) linie.push(`Branża: ${przytnij(b.branza, 80)}`);
  if (b.opis?.trim()) linie.push(`Opis: ${przytnij(b.opis, 240)}`);
  if (b.cechy?.length) linie.push(`Cechy: ${b.cechy.join(', ')}`);
  if (b.uwagi?.trim()) linie.push(`Uwagi: ${przytnij(b.uwagi, 300)}`);
  return `<brief>\n${ucieczkaMarki(linie.join('\n'))}\n</brief>`;
}

/** Inicjały nazwy (monogram): pierwsze litery dwóch pierwszych znaczących słów, wielkie. */
export function inicjaly(nazwa: string): string {
  const pomijane = new Set(['i', 'a', 'z', 'w', 'o', 'na', 'do', 'sp', 'spółka', 'oo', 's', 'c', 'the', 'and', 'of']);
  const slowa = nazwa
    .split(/[^\p{L}\p{N}]+/u)
    .filter((s) => s && !pomijane.has(s.toLocaleLowerCase('pl-PL')) && /\p{L}/u.test(s));
  const litery = slowa.slice(0, 2).map((s) => [...s].find((c) => /\p{L}/u.test(c)) ?? '');
  return litery.join('').toLocaleUpperCase('pl-PL') || [...nazwa].find((c) => /\p{L}/u.test(c))?.toLocaleUpperCase('pl-PL') || 'A';
}

/** Litery monogramu od AI: 1–2 litery występujące w nazwie, inaczej inicjały. */
export function literyMonogramu(l: unknown, nazwa: string): string {
  if (typeof l === 'string') {
    const litery = [...l].filter((c) => /\p{L}/u.test(c)).slice(0, 2).join('');
    const n = nazwa.toLocaleLowerCase('pl-PL');
    if (litery && [...litery].every((c) => n.includes(c.toLocaleLowerCase('pl-PL')))) return litery.toLocaleUpperCase('pl-PL');
  }
  return inicjaly(nazwa);
}

export type CharakterPaletyMarki = (typeof CHARAKTERY_PALET)[number];

/**
 * KoloryMarki kierunku od AI: `barwa` = barwa AKCENTU (zakres slotu), `barwaGlowna` = barwa koloru głównego
 * (domyślnie ta sama). Jedno źródło kolorów marki – `koloryMarki` z kolory-marki.ts (kontrast znaku ≥ 3:1, napisu
 * ≥ 4,5:1, akcent jasny ≥ 3:1 z głównym, paleta strony z korektą kontrastu). Deterministyczne.
 */
export function koloryKierunku(barwa: number, charakter: CharakterPaletyMarki, barwaGlowna?: number): KoloryMarki {
  const h = ((Math.round(barwa) % 360) + 360) % 360;
  const hg = barwaGlowna === undefined ? h : ((Math.round(barwaGlowna) % 360) + 360) % 360;
  return KoloryMarki.parse(koloryMarki(hg, charakter, { akcentBarwa: h }));
}

/** Jedna runda naprawy dla operacji marki – ten sam format co w kreatorze stron. */
export function naprawaMarki(odpowiedz: string, bledy: string[]): WiadomoscAi[] {
  const lista = bledy.slice(0, 30).map((b) => `- ${b}`).join('\n');
  return [
    { role: 'assistant', content: odpowiedz.trim() || '{}' },
    {
      role: 'user',
      content: `Odpowiedź nie przeszła walidacji. Błędy (ścieżka: problem):\n${lista}\n\nPopraw wyłącznie te miejsca i zwróć pełną odpowiedź w tym samym formacie – wyłącznie JSON w zapisie kompaktowym.`,
    },
  ];
}
