/**
 * Minimalny parser HTML dla eksportu do CMS (paczka 124). Wejście to WYŁĄCZNIE wynik renderera kreatora
 * (render/**): poprawnie zagnieżdżone znaczniki, atrybuty w cudzysłowach podwójnych, tekst po `esc()`.
 * Nie jest to parser ogólnego HTML z sieci – nie naprawia błędów, tylko rzuca wyjątek, gdy struktura się nie zgadza
 * (test eksportu wtedy czerwienieje, zamiast po cichu gubić treść).
 */

export interface Wezel {
  tag: string;
  atrybuty: Record<string, string>;
  /** Kolejność atrybutów jak w źródle (serializacja bez zmian). */
  kolejnosc: string[];
  dzieci: Wezel[] | null;
  /** Tekst (już ze znakami encji jak w źródle) – tylko dla węzła `#text`. */
  tekst?: string;
}

const PUSTE = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

export function wezelTekstu(tekst: string): Wezel {
  return { tag: '#text', atrybuty: {}, kolejnosc: [], dzieci: null, tekst };
}

/** Parsuje fragment HTML do listy węzłów. */
export function parsujHtml(html: string): Wezel[] {
  const korzen: Wezel = { tag: '#root', atrybuty: {}, kolejnosc: [], dzieci: [] };
  const stos: Wezel[] = [korzen];
  let i = 0;
  const n = html.length;
  while (i < n) {
    const lt = html.indexOf('<', i);
    if (lt < 0) {
      dodajTekst(stos, html.slice(i));
      break;
    }
    if (lt > i) dodajTekst(stos, html.slice(i, lt));
    if (html.startsWith('<!--', lt)) {
      const koniec = html.indexOf('-->', lt + 4);
      i = koniec < 0 ? n : koniec + 3;
      continue;
    }
    if (html.startsWith('<!', lt)) {
      const koniec = html.indexOf('>', lt);
      i = koniec < 0 ? n : koniec + 1;
      continue;
    }
    if (html[lt + 1] === '/') {
      const koniec = html.indexOf('>', lt);
      const tag = html.slice(lt + 2, koniec).trim().toLowerCase();
      const gora = stos[stos.length - 1]!;
      if (gora.tag !== tag) throw new Error(`HTML: zamknięcie </${tag}> bez otwarcia (otwarty <${gora.tag}>)`);
      stos.pop();
      i = koniec + 1;
      continue;
    }
    // Otwarcie znacznika: nazwa, atrybuty (wartości w cudzysłowach mogą zawierać „>”), opcjonalne „/>”.
    let j = lt + 1;
    while (j < n && /[A-Za-z0-9:-]/.test(html[j]!)) j++;
    const tag = html.slice(lt + 1, j).toLowerCase();
    if (!tag) {
      dodajTekst(stos, '<');
      i = lt + 1;
      continue;
    }
    const atrybuty: Record<string, string> = {};
    const kolejnosc: string[] = [];
    let samozamkniety = false;
    for (;;) {
      while (j < n && /\s/.test(html[j]!)) j++;
      if (j >= n) throw new Error(`HTML: niedomknięty znacznik <${tag}>`);
      if (html[j] === '>') {
        j++;
        break;
      }
      if (html[j] === '/' && html[j + 1] === '>') {
        samozamkniety = true;
        j += 2;
        break;
      }
      const start = j;
      while (j < n && !/[\s=>/]/.test(html[j]!)) j++;
      // Wielkość liter jak w źródle (SVG: viewBox, preserveAspectRatio).
      const nazwa = html.slice(start, j);
      let wartosc = '';
      if (html[j] === '=') {
        j++;
        const cudzyslow = html[j];
        if (cudzyslow === '"' || cudzyslow === "'") {
          const k = html.indexOf(cudzyslow, j + 1);
          if (k < 0) throw new Error(`HTML: niedomknięty atrybut ${nazwa} w <${tag}>`);
          wartosc = html.slice(j + 1, k);
          j = k + 1;
        } else {
          const s = j;
          while (j < n && !/[\s>]/.test(html[j]!)) j++;
          wartosc = html.slice(s, j);
        }
      }
      if (!nazwa) {
        j++;
        continue;
      }
      if (!(nazwa in atrybuty)) kolejnosc.push(nazwa);
      atrybuty[nazwa] = wartosc;
    }
    const wezel: Wezel = { tag, atrybuty, kolejnosc, dzieci: PUSTE.has(tag) || samozamkniety ? null : [] };
    stos[stos.length - 1]!.dzieci!.push(wezel);
    if (wezel.dzieci) stos.push(wezel);
    i = j;
  }
  if (stos.length !== 1) throw new Error(`HTML: niezamknięty znacznik <${stos[stos.length - 1]!.tag}>`);
  return korzen.dzieci!;
}

function dodajTekst(stos: Wezel[], tekst: string): void {
  if (!tekst) return;
  stos[stos.length - 1]!.dzieci!.push(wezelTekstu(tekst));
}

/** Atrybuty z powrotem do HTML (wartości są już zakodowane encjami jak w źródle). */
export function atrybutyHtml(w: Wezel): string {
  return w.kolejnosc.map((a) => ` ${a}="${w.atrybuty[a]!.replace(/"/g, '&quot;')}"`).join('');
}

/** Węzły z powrotem do HTML (bez zmian poza normalizacją cudzysłowów atrybutów). */
export function htmlWezlow(wezly: Wezel[]): string {
  return wezly.map(htmlWezla).join('');
}

export function htmlWezla(w: Wezel): string {
  if (w.tag === '#text') return w.tekst ?? '';
  if (w.dzieci === null) {
    return PUSTE.has(w.tag) ? `<${w.tag}${atrybutyHtml(w)}>` : `<${w.tag}${atrybutyHtml(w)}/>`;
  }
  return `<${w.tag}${atrybutyHtml(w)}>${htmlWezlow(w.dzieci)}</${w.tag}>`;
}

export function klasy(w: Wezel): string[] {
  return (w.atrybuty.class ?? '').split(/\s+/).filter(Boolean);
}

export function maKlase(w: Wezel, klasa: string): boolean {
  return klasy(w).includes(klasa);
}

/** Pierwszy węzeł (w głąb) spełniający warunek. */
export function znajdz(wezly: Wezel[], warunek: (w: Wezel) => boolean): Wezel | null {
  for (const w of wezly) {
    if (w.tag === '#text') continue;
    if (warunek(w)) return w;
    if (w.dzieci) {
      const z = znajdz(w.dzieci, warunek);
      if (z) return z;
    }
  }
  return null;
}

/** Tekst węzła bez znaczników (encje bez zmian). */
export function tekstWezla(w: Wezel): string {
  if (w.tag === '#text') return w.tekst ?? '';
  return (w.dzieci ?? []).map(tekstWezla).join('');
}

/** Zamienia encje HTML na znaki (tylko te, które produkuje esc() renderera, i numeryczne). */
export function bezEncji(tekst: string): string {
  return tekst.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|nbsp);/gi, (_, e: string) => {
    const m = e.toLowerCase();
    if (m === 'amp') return '&';
    if (m === 'lt') return '<';
    if (m === 'gt') return '>';
    if (m === 'quot') return '"';
    if (m === 'nbsp') return ' ';
    if (m.startsWith('#x')) return String.fromCodePoint(parseInt(m.slice(2), 16));
    return String.fromCodePoint(parseInt(m.slice(1), 10));
  });
}
