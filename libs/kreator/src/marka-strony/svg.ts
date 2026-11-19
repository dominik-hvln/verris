/**
 * Logo marki na stronie z kreatora (paczka 130) – wąska walidacja i bezpieczna serializacja SVG.
 *
 * SVG migawki marki generuje serwer z modelu marki (plik zaufany), ale trafia on do modelu strony (JSON w bazie, zapis
 * z edytora) i jest wstawiany INLINE w HTML strony klienta – dlatego obrona jest podwójna:
 * 1. model (`MarkaStrony`, zod) przyjmuje tylko SVG, które przechodzi `analizujSvgMarki` (biała lista elementów
 *    i atrybutów, bez skryptów, zdarzeń `on*`, `<foreignObject>`, `style`, odwołań zewnętrznych, `javascript:`);
 * 2. renderer nie wkleja tekstu z modelu, tylko serializuje na nowo drzewo z tej samej białej listy (`czystySvgMarki`)
 *    – wartości atrybutów i tekst przez escapowanie, identyfikatory z prefiksem (dwa logo na stronie bez kolizji id).
 *
 * Moduł bez zależności (trafia też do przeglądarki przez model strony – `@verris/kreator/klient`).
 * Walidator sygnetów kreatora marki (marka/walidator-svg.ts) jest ostrzejszy (viewBox 0 0 100 100, same ścieżki,
 * limity węzłów); tu sprawdzamy całe logo z napisem, więc dozwolone są też tekst, gradienty i maski.
 */

/** Najdłuższe SVG logo w modelu strony (znaki; napis zamieniony na krzywe bywa długi). */
export const MAKS_SVG_LOGO = 60_000;
/** Favicon jest mały z definicji. */
export const MAKS_SVG_FAVICONU = 20_000;
const MAKS_ELEMENTOW = 2_000;
const MAKS_GLEBOKOSC = 32;

/** Elementy dozwolone (małymi literami → nazwa kanoniczna SVG). `metadata` jest przyjmowane, ale nie trafia na stronę. */
const ELEMENTY: Record<string, string> = Object.fromEntries(
  ['svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'polygon', 'polyline', 'line', 'defs', 'clipPath', 'mask', 'linearGradient', 'radialGradient', 'stop', 'use', 'text', 'tspan', 'title', 'desc', 'metadata'].map(
    (e) => [e.toLowerCase(), e],
  ),
);
/** Elementy, w których wolno mieć tekst. */
const Z_TEKSTEM = new Set(['text', 'tspan', 'title', 'desc']);
/** Opis dostępności z pliku nie trafia na stronę (logo jest dekoracją linku z nazwą firmy). */
const POMIJANE_NA_STRONIE = new Set(['metadata', 'title', 'desc']);

const ATRYBUTY: Record<string, string> = Object.fromEntries(
  [
    'xmlns', 'xmlns:xlink', 'version', 'viewBox', 'width', 'height', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'fx', 'fy',
    'dx', 'dy', 'd', 'points', 'pathLength', 'fill', 'fill-rule', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
    'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-opacity', 'opacity', 'clip-rule', 'clip-path', 'mask', 'transform', 'id',
    'class', 'role', 'aria-label', 'aria-hidden', 'focusable', 'preserveAspectRatio', 'font-family', 'font-size', 'font-weight', 'font-style',
    'letter-spacing', 'text-anchor', 'dominant-baseline', 'offset', 'stop-color', 'stop-opacity', 'gradientUnits', 'gradientTransform',
    'spreadMethod', 'clipPathUnits', 'maskUnits', 'maskContentUnits', 'href', 'xlink:href', 'paint-order', 'vector-effect', 'shape-rendering',
  ].map((a) => [a.toLowerCase(), a]),
);
const NS_SVG = 'http://www.w3.org/2000/svg';
const NS_XLINK = 'http://www.w3.org/1999/xlink';
const ID = /^[A-Za-z_][\w.-]{0,60}$/;
const ODWOLANIE = /^#[A-Za-z_][\w.-]{0,60}$/;

export interface WezelSvg {
  nazwa: string;
  atrybuty: [string, string][];
  dzieci: (WezelSvg | string)[];
}

export type WynikAnalizySvg = { ok: true; drzewo: WezelSvg } | { ok: false; bledy: string[] };

const ENCJE: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** Encje XML → znaki; nieznana encja nazwana = null (DTD i encje zewnętrzne są zabronione). */
function dekoduj(tekst: string): string | null {
  let blad = false;
  const wynik = tekst.replace(/&(#x[0-9a-fA-F]{1,6}|#[0-9]{1,7}|[A-Za-z]+);?/g, (_, e: string) => {
    if (e[0] === '#') {
      const kod = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      if (!(kod > 0 && kod <= 0x10ffff) || (kod >= 0xd800 && kod <= 0xdfff)) {
        blad = true;
        return '';
      }
      return String.fromCodePoint(kod);
    }
    const z = ENCJE[e];
    if (z === undefined) blad = true;
    return z ?? '';
  });
  return blad ? null : wynik;
}

/** Sprawdzenie wartości atrybutu po zdekodowaniu encji; zwraca opis błędu albo null. */
function bladWartosci(nazwa: string, w: string): string | null {
  if (/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(w)) return `niedozwolone znaki w atrybucie ${nazwa}`;
  if (nazwa === 'xmlns') return w === NS_SVG ? null : 'nieznana przestrzeń nazw';
  if (nazwa === 'xmlns:xlink') return w === NS_XLINK ? null : 'nieznana przestrzeń nazw xlink';
  if (nazwa === 'href' || nazwa === 'xlink:href') return ODWOLANIE.test(w) ? null : 'odwołanie poza plik (dozwolone tylko #id)';
  if (nazwa === 'id') return ID.test(w) ? null : 'nieprawidłowy identyfikator';
  // Dwukropek = schemat adresu (javascript:, data:, https:) – w geometrii, kolorach i transformacjach go nie ma.
  if (nazwa !== 'aria-label' && w.includes(':')) return `niedozwolony adres w atrybucie ${nazwa}`;
  for (const m of w.matchAll(/url\(([^)]*)\)/gi)) if (!ODWOLANIE.test((m[1] ?? '').trim().replace(/^['"]|['"]$/g, ''))) return `url() poza plikiem w atrybucie ${nazwa}`;
  if (/expression\s*\(|@import|\\/i.test(w)) return `niedozwolona wartość atrybutu ${nazwa}`;
  return null;
}

/**
 * Parsuje i sprawdza SVG logo. Ścisły format XML: atrybuty w cudzysłowach, zamknięcia zgodne z otwarciami, jeden korzeń
 * `<svg>` na początku pliku, bez DOCTYPE, CDATA, instrukcji przetwarzania i encji spoza XML.
 */
export function analizujSvgMarki(svg: unknown, maks = MAKS_SVG_LOGO): WynikAnalizySvg {
  const bledy: string[] = [];
  if (typeof svg !== 'string') return { ok: false, bledy: ['to nie jest tekst SVG'] };
  if (svg.length > maks) return { ok: false, bledy: [`plik SVG za długi (najwyżej ${maks} znaków)`] };
  const zrodlo = svg.trim();
  if (!zrodlo.startsWith('<svg')) return { ok: false, bledy: ['plik musi zaczynać się od <svg'] };
  if (/<!(?!--)|<\?/.test(zrodlo)) return { ok: false, bledy: ['DOCTYPE, CDATA, encje i instrukcje przetwarzania są niedozwolone'] };

  const korzen: WezelSvg = { nazwa: '#korzen', atrybuty: [], dzieci: [] };
  const stos: WezelSvg[] = [korzen];
  /** Głębokość wnętrza <metadata> (0 = poza nim) – tam dowolne elementy, ale nie trafiają na stronę. */
  let wMetadanych = 0;
  let elementow = 0;
  let i = 0;
  const n = zrodlo.length;
  const blad = (b: string): WynikAnalizySvg => ({ ok: false, bledy: [...bledy, b] });

  while (i < n) {
    const lt = zrodlo.indexOf('<', i);
    const tekst = zrodlo.slice(i, lt < 0 ? n : lt);
    if (tekst) {
      const gora = stos[stos.length - 1]!;
      if (gora === korzen) {
        if (tekst.trim()) return blad('tekst poza elementem <svg>');
      } else if (wMetadanych === 0) {
        const t = dekoduj(tekst);
        if (t === null) return blad('nieznana encja w tekście');
        if (t.trim() && !Z_TEKSTEM.has(gora.nazwa)) return blad(`tekst w elemencie <${gora.nazwa}>`);
        if (Z_TEKSTEM.has(gora.nazwa)) gora.dzieci.push(t);
      }
    }
    if (lt < 0) break;
    if (zrodlo.startsWith('<!--', lt)) {
      const k = zrodlo.indexOf('-->', lt + 4);
      if (k < 0) return blad('niezamknięty komentarz');
      i = k + 3;
      continue;
    }
    if (zrodlo[lt + 1] === '/') {
      const k = zrodlo.indexOf('>', lt);
      if (k < 0) return blad('niezamknięty znacznik');
      const nazwa = zrodlo.slice(lt + 2, k).trim();
      const gora = stos[stos.length - 1]!;
      if (gora === korzen || gora.nazwa.toLowerCase() !== nazwa.toLowerCase()) return blad(`zamknięcie </${nazwa}> bez otwarcia`);
      stos.pop();
      if (wMetadanych > 0) wMetadanych--;
      i = k + 1;
      continue;
    }
    let j = lt + 1;
    while (j < n && /[A-Za-z0-9:._-]/.test(zrodlo[j]!)) j++;
    const surowa = zrodlo.slice(lt + 1, j);
    if (!/^[A-Za-z][\w:.-]{0,40}$/.test(surowa)) return blad('nieprawidłowa nazwa elementu');
    const mala = surowa.toLowerCase();
    const wMeta = wMetadanych > 0;
    if (!wMeta && !ELEMENTY[mala]) return blad(`niedozwolony element <${surowa}>`);
    if (stos.length === 1 && (mala !== 'svg' || korzen.dzieci.length)) return blad('plik musi mieć dokładnie jeden element <svg>');
    if (++elementow > MAKS_ELEMENTOW) return blad(`za dużo elementów (najwyżej ${MAKS_ELEMENTOW})`);
    if (stos.length > MAKS_GLEBOKOSC) return blad('za głęboko zagnieżdżone elementy');

    const atrybuty: [string, string][] = [];
    const widziane = new Set<string>();
    let samozamkniety = false;
    for (;;) {
      const przed = j;
      while (j < n && /\s/.test(zrodlo[j]!)) j++;
      if (j >= n) return blad(`niedomknięty znacznik <${surowa}>`);
      if (zrodlo[j] === '>') {
        j++;
        break;
      }
      if (zrodlo[j] === '/' && zrodlo[j + 1] === '>') {
        samozamkniety = true;
        j += 2;
        break;
      }
      if (j === przed) return blad(`brak odstępu między atrybutami w <${surowa}>`);
      const start = j;
      while (j < n && /[A-Za-z0-9:._-]/.test(zrodlo[j]!)) j++;
      const nazwaA = zrodlo.slice(start, j);
      if (!nazwaA) return blad(`nieprawidłowy atrybut w <${surowa}>`);
      if (zrodlo[j] !== '=' || (zrodlo[j + 1] !== '"' && zrodlo[j + 1] !== "'")) return blad(`atrybut ${nazwaA} bez wartości w cudzysłowie`);
      const q = zrodlo[j + 1]!;
      const k = zrodlo.indexOf(q, j + 2);
      if (k < 0) return blad(`niedomknięty atrybut ${nazwaA}`);
      const wartosc = dekoduj(zrodlo.slice(j + 2, k));
      j = k + 1;
      const malaA = nazwaA.toLowerCase();
      if (malaA.startsWith('on')) return blad(`atrybut zdarzenia ${nazwaA} jest niedozwolony`);
      if (malaA === 'style') return blad('atrybut style jest niedozwolony');
      if (widziane.has(malaA)) return blad(`powtórzony atrybut ${nazwaA}`);
      widziane.add(malaA);
      if (wartosc === null) return blad(`nieznana encja w atrybucie ${nazwaA}`);
      if (wMeta) {
        // Metadane (np. „wygenerowano z pomocą AI”) – dowolne nazwy przestrzeni, ale bez adresów wykonywalnych.
        if (/href$/i.test(malaA) || /javascript\s*:|[<>]/i.test(wartosc)) return blad(`niedozwolony atrybut ${nazwaA} w metadanych`);
        continue;
      }
      const kanon = ATRYBUTY[malaA];
      if (!kanon) return blad(`niedozwolony atrybut ${nazwaA} w <${surowa}>`);
      const b = bladWartosci(kanon, wartosc);
      if (b) return blad(b);
      atrybuty.push([kanon, wartosc]);
    }
    const wezel: WezelSvg = { nazwa: wMeta ? mala : ELEMENTY[mala]!, atrybuty, dzieci: [] };
    if (!wMeta) stos[stos.length - 1]!.dzieci.push(wezel);
    if (!samozamkniety) {
      stos.push(wezel);
      if (wMeta || mala === 'metadata') wMetadanych++;
    }
    i = j;
  }
  if (stos.length !== 1) return blad(`niezamknięty element <${stos[stos.length - 1]!.nazwa}>`);
  const svgEl = korzen.dzieci[0];
  if (!svgEl || typeof svgEl === 'string') return blad('brak elementu <svg>');
  if (!svgEl.atrybuty.some(([a]) => a === 'viewBox')) return blad('element <svg> bez viewBox');
  return { ok: true, drzewo: svgEl };
}

/** Czy tekst przechodzi walidację (do zod refine). */
export function czySvgMarki(svg: unknown, maks = MAKS_SVG_LOGO): boolean {
  return analizujSvgMarki(svg, maks).ok;
}

const escSvg = (t: string) => t.replace(/[&<>"']/g, (z) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[z]!);

export interface OpcjeSvgMarki {
  /** Prefiks identyfikatorów (id, href="#…", url(#…)) – każde wystąpienie logo na stronie dostaje własny. */
  prefiksId?: string;
  /**
   * Plik samodzielny (favicon.svg, logo.svg w ZIP i motywie WordPressa): kolory kanałów wpisane na stałe –
   * `currentColor` → główny, `var(--akcent…)` → akcent (w pliku otwieranym jako obraz nie ma CSS strony).
   * Brak = inline na stronie: kolory z CSS (`color` i `--akcent` rodzica), `aria-hidden`.
   */
  plik?: { glowny: string; akcent: string };
}

function przepiszWartosc(nazwa: string, w: string, o: OpcjeSvgMarki): string {
  let x = w;
  if (o.prefiksId) {
    const p = o.prefiksId;
    if (nazwa === 'id') x = `${p}-${x}`;
    else if (nazwa === 'href' || nazwa === 'xlink:href') x = `#${p}-${x.slice(1)}`;
    else x = x.replace(/url\(\s*['"]?#([A-Za-z_][\w.-]*)['"]?\s*\)/g, (_, id: string) => `url(#${p}-${id})`);
  }
  if (o.plik) {
    x = x.replace(/var\(\s*--akcent\b[^)]*\)/gi, o.plik.akcent).replace(/\bcurrentColor\b/gi, o.plik.glowny);
  }
  return x;
}

function serializuj(w: WezelSvg, o: OpcjeSvgMarki, korzen: boolean): string {
  if (POMIJANE_NA_STRONIE.has(w.nazwa)) return '';
  let atr = w.atrybuty.filter(([a]) => !(korzen && !o.plik && (a === 'role' || a === 'aria-label' || a === 'aria-hidden' || a === 'focusable' || a === 'width' || a === 'height')));
  if (korzen) {
    atr = atr.filter(([a]) => a !== 'xmlns' && a !== 'xmlns:xlink');
    const uzywaXlink = JSON.stringify(w).includes('"xlink:href"');
    const dodatkowe: [string, string][] = [['xmlns', NS_SVG], ...(uzywaXlink ? ([['xmlns:xlink', NS_XLINK]] as [string, string][]) : [])];
    if (!o.plik) dodatkowe.push(['aria-hidden', 'true'], ['focusable', 'false']);
    atr = [...dodatkowe, ...atr];
  }
  const a = atr.map(([k, v]) => ` ${k}="${escSvg(przepiszWartosc(k, v, o))}"`).join('');
  const dzieci = w.dzieci.map((d) => (typeof d === 'string' ? escSvg(d) : serializuj(d, o, false))).join('');
  return dzieci ? `<${w.nazwa}${a}>${dzieci}</${w.nazwa}>` : `<${w.nazwa}${a}/>`;
}

/**
 * SVG po walidacji zapisany na nowo z białej listy (nic z wejścia nie przechodzi bez escapowania). null = SVG nie
 * przeszło walidacji (renderer wtedy rysuje inicjał – model i tak takiego SVG nie przyjmie).
 */
export function czystySvgMarki(svg: unknown, o: OpcjeSvgMarki = {}, maks = MAKS_SVG_LOGO): string | null {
  const w = analizujSvgMarki(svg, maks);
  if (!w.ok) return null;
  return serializuj(w.drzewo, o, true);
}
