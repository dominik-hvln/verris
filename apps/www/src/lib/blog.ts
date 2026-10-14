// Pomocnicze funkcje szablonu wpisu (makieta 14.10, BlogWpis.dc.html) — działają na treści Lexical z Payload
// bez zmiany schematu kolekcji `posts`.
import { lexicalToText } from './lexical-text';

type LexNode = { type?: string; tag?: string; text?: string; children?: LexNode[]; [k: string]: unknown };
type LexRoot = { root?: LexNode & { children?: LexNode[] } };

export type Naglowek = { id: string; tekst: string };

/** Tekst węzła (rekurencyjnie) — do nagłówków i punktów listy. */
export function tekstWezla(n: LexNode | undefined): string {
  if (!n) return '';
  if (typeof n.text === 'string') return n.text;
  return (n.children ?? []).map(tekstWezla).join('');
}

/** Kotwica z tekstu nagłówka: małe litery, bez polskich znaków, myślniki. */
export function kotwica(tekst: string): string {
  const baza = tekst
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return baza || 'sekcja';
}

/**
 * Generator unikalnych kotwic. Ta sama kolejność wywołań (kolejność nagłówków w dokumencie) daje te same id
 * w spisie treści i w treści wpisu.
 */
export function kotwice() {
  const uzyte = new Map<string, number>();
  return (tekst: string) => {
    const k = kotwica(tekst);
    const n = uzyte.get(k) ?? 0;
    uzyte.set(k, n + 1);
    return n === 0 ? k : `${k}-${n + 1}`;
  };
}

/** Poziom nagłówka po mapowaniu w treści wpisu: h1 → h2 (jedno H1 na stronie), h4–h6 → h3. */
export function poziomWTresci(tag: string | undefined): 'h2' | 'h3' {
  return tag === 'h1' || tag === 'h2' ? 'h2' : 'h3';
}

/** Spis treści: nagłówki, które w treści wpisu będą H2 (po mapowaniu), z kotwicami. */
export function spisTresci(content: unknown): Naglowek[] {
  const dzieci = (content as LexRoot | undefined)?.root?.children ?? [];
  const nowa = kotwice();
  const out: Naglowek[] = [];
  for (const n of dzieci) {
    if (n.type !== 'heading') continue;
    const tekst = tekstWezla(n).trim();
    const id = nowa(tekst);
    if (poziomWTresci(n.tag) === 'h2' && tekst) out.push({ id, tekst });
  }
  return out;
}

/**
 * „W skrócie”: jeśli treść zaczyna się od nagłówka „W skrócie” i listy, zwraca punkty listy oraz treść bez tych
 * dwóch węzłów (żeby nie powtarzać ich w artykule). Bez takiego początku — brak ramki i treść bez zmian.
 */
export function wSkrocie(content: unknown): { punkty: string[]; tresc: unknown } {
  const root = (content as LexRoot | undefined)?.root;
  const dzieci = root?.children ?? [];
  const [h, lista] = dzieci;
  if (
    h?.type === 'heading' &&
    /^w\s+skr[oó]cie:?$/i.test(tekstWezla(h).trim()) &&
    lista?.type === 'list'
  ) {
    const punkty = (lista.children ?? []).map((li) => tekstWezla(li).trim()).filter(Boolean);
    if (punkty.length > 0) {
      return { punkty, tresc: { ...(content as object), root: { ...root, children: dzieci.slice(2) } } };
    }
  }
  return { punkty: [], tresc: content };
}

/** Czas czytania w minutach (200 słów/min, co najmniej 1); 0, gdy treści brak. */
export function czasCzytania(content: unknown): number {
  const slowa = lexicalToText(content).split(/\s+/).filter(Boolean).length;
  return slowa === 0 ? 0 : Math.max(1, Math.round(slowa / 200));
}

/** Przycina tekst do limitu znaków na granicy słowa (meta description ≤ 155). */
export function przytnij(tekst: string | undefined, limit = 155): string | undefined {
  if (!tekst) return tekst;
  const t = tekst.replace(/\s+/g, ' ').trim();
  if (t.length <= limit) return t;
  const cut = t.slice(0, limit - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 1)).replace(/[\s,.;:–—-]+$/, '')}…`;
}

/** Data po polsku, np. „14 października 2026”. */
export function dataPL(iso: string): string {
  return new Date(iso).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });
}
