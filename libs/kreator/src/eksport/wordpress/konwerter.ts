import { KLASA_ZAKRESU, ZNACZNIKI_ZASTEPCZE, klasaZnacznika, prefiksKlas } from '../css.ts';
import { bezEncji, htmlWezla, klasy, maKlase, tekstWezla, type Wezel } from '../html.ts';
import * as b from './bloki.ts';

/**
 * HTML renderera (treść <main>, nagłówek, stopka) → bloki WordPressa 1:1 co do struktury i klas:
 * sekcja → core/group <section> z klasami sekcji, kontenery → core/group, nagłówki → core/heading, akapity →
 * core/paragraph, przyciski → core/buttons, zdjęcia → core/image (galeria → core/gallery), FAQ → core/details,
 * cytat → core/quote, pakiety cennika → core/columns z core/column, proste listy → core/list. Formularz, ikony SVG,
 * ramki zastępcze zdjęć i tabela – core/html (blok edytora nie ma odpowiednika; HTML jest z renderera, po esc()).
 * Wygląd daje arkusz renderera z przestrzenią nazw (eksport/css.ts) – stąd klasy `vk-*` i `vke-<znacznik>`.
 */

export const TOKEN_STRONY = 'verris-kreator://strona/';
export const TOKEN_MEDIUM = 'verris-kreator://media/';

export interface KontekstKonwersji {
  /** Slug podstrony, z której pochodzi HTML (do rozwiązywania linków względnych). */
  slug: string;
  /** slug podstrony → klucz strony w eksporcie. */
  klucze: Map<string, string>;
  /** Kotwice „#x” prowadzą do strony głównej (części motywu wspólne dla wszystkich stron). */
  kotwiceDoGlownej?: boolean;
  /** Zdjęcia z biblioteki użyte w treści (zasobId). */
  media: Set<string>;
  ostrzezenia: string[];
}

const INLINE = new Set(['a', 'em', 'strong', 'b', 'i', 'span', 'br', 'time', 'small', 'code', 'sup', 'sub', 'abbr', 'mark', 's', 'u']);
const SUROWE = new Set(['svg', 'table', 'form', 'button', 'select', 'input', 'textarea', 'iframe', 'video', 'audio', 'canvas']);
const GRUPY: Record<string, b.ZnacznikGrupy> = { section: 'section', header: 'header', footer: 'footer', article: 'article', aside: 'aside', main: 'main' };
/** Elementy, których nie przenosimy: sterowanie karuzelą i przełącznikiem cen działa tylko ze skryptem strony statycznej. */
const POMIJANE_KLASY = ['karuzela-nav', 'przelacznik', 'menu-btn', 'wstega-pro'];

/** Klasy działające tylko ze skryptem strony statycznej (pojawianie przy przewijaniu) – w blokach zbędne. */
const BEZ_SKRYPTU = new Set(['vk-pojaw']);

const bialy = (w: Wezel) => w.tag === '#text' && !(w.tekst ?? '').trim();

function czyPrzycisk(w: Wezel): boolean {
  return w.tag === 'a' && klasy(w).some((k) => k === 'btn');
}

/** Węzeł mieści się w treści akapitu (tekst, znaczniki wierszowe bez SVG i bez przycisków). */
function wierszowy(w: Wezel): boolean {
  if (w.tag === '#text') return true;
  if (!INLINE.has(w.tag) || czyPrzycisk(w)) return false;
  return (w.dzieci ?? []).every(wierszowy);
}

/** Link z renderera → adres w eksporcie: podstrona kreatora = token strony, reszta bez zmian. */
export function adresLinku(href: string, k: KontekstKonwersji): string {
  const surowy = bezEncji(href);
  if (/^(https?:|tel:|mailto:)/i.test(surowy)) return href;
  if (surowy.startsWith('#')) {
    return k.kotwiceDoGlownej ? `${TOKEN_STRONY}${k.klucze.get('') ?? 'glowna'}${surowy}` : href;
  }
  let url: URL;
  try {
    url = new URL(surowy, `https://kreator.invalid/${k.slug ? `${k.slug}/` : ''}`);
  } catch {
    return href;
  }
  const slug = url.pathname.replace(/^\/+|\/+$/g, '');
  const klucz = k.klucze.get(slug);
  if (klucz !== undefined) return `${TOKEN_STRONY}${klucz}${url.hash}`;
  k.ostrzezenia.push(`Link „${surowy}” nie prowadzi do podstrony kreatora – w WordPressie zostaje adresem względem domeny.`);
  return `${url.pathname}${url.search}${url.hash}`.replace(/"/g, '%22');
}

/** HTML węzłów z klasami w przestrzeni nazw i linkami podstron jako tokeny. */
export function htmlZPrzestrzenia(wezly: Wezel[], k: KontekstKonwersji): string {
  return wezly.map((w) => htmlWezla(przepisz(w, k))).join('');
}

function przepisz(w: Wezel, k: KontekstKonwersji): Wezel {
  if (w.tag === '#text') return w;
  const atrybuty = { ...w.atrybuty };
  const kolejnosc = w.kolejnosc.filter((a) => !a.startsWith('data-k'));
  if (atrybuty.class !== undefined) atrybuty.class = prefiksKlas(atrybuty.class);
  if (w.tag === 'a' && atrybuty.href !== undefined) atrybuty.href = adresLinku(atrybuty.href, k);
  return { ...w, atrybuty, kolejnosc, dzieci: w.dzieci ? w.dzieci.map((d) => przepisz(d, k)) : null };
}

/** Klasy węzła w przestrzeni nazw + klasa zastępcza znacznika (li → vke-li) + dodatkowe. */
function klasyBloku(w: Wezel, ...dodatkowe: string[]): string {
  const lista = [...dodatkowe, ...(ZNACZNIKI_ZASTEPCZE.has(w.tag) ? [klasaZnacznika(w.tag)] : []), ...(w.atrybuty.class ? [prefiksKlas(w.atrybuty.class)] : [])];
  return [...new Set(lista.join(' ').split(' ').filter((x) => x && !BEZ_SKRYPTU.has(x)))].join(' ');
}

/** Zdjęcie w ramce `.ob` → core/image (biblioteka), albo core/html (ramka zastępcza, zdjęcie spoza biblioteki). */
function obrazZRamki(w: Wezel, k: KontekstKonwersji, dodatkowe: string[] = []): string {
  const img = znajdzWezel(w, (x) => x.tag === 'img');
  const src = img ? bezEncji(img.atrybuty.src ?? '') : '';
  const i = src.indexOf(TOKEN_MEDIUM);
  if (img && i >= 0) {
    const zasobId = src.slice(i + TOKEN_MEDIUM.length).split('/')[0]!;
    k.media.add(zasobId);
    const podpis = znajdzWezel(w, (x) => x.tag === 'figcaption');
    return b.obraz({ klasa: klasyBloku(w, ...dodatkowe).replace(/(^| )vke-figure( |$)/, '$1').trim() }, `${TOKEN_MEDIUM}${zasobId}`, img.atrybuty.alt ?? '', podpis ? htmlZPrzestrzenia(podpis.dzieci ?? [], k) : undefined);
  }
  if (img && /^https:\/\//i.test(src)) {
    return b.obraz({ klasa: klasyBloku(w, ...dodatkowe) }, img.atrybuty.src ?? '', img.atrybuty.alt ?? '');
  }
  if (img) k.ostrzezenia.push(`Zdjęcie „${bezEncji(img.atrybuty.alt ?? '')}” nie pochodzi z biblioteki zdjęć – w WordPressie zostaje puste miejsce do uzupełnienia.`);
  const ramka: Wezel = { ...w, dzieci: img ? [] : w.dzieci, atrybuty: { ...w.atrybuty, class: [w.atrybuty.class ?? '', ...dodatkowe.map((d) => d.replace(/^vk-/, ''))].join(' ').trim() } };
  if (!ramka.kolejnosc.includes('class')) ramka.kolejnosc = ['class', ...ramka.kolejnosc];
  return b.html(htmlZPrzestrzenia([ramka], k));
}

function znajdzWezel(w: Wezel, warunek: (x: Wezel) => boolean): Wezel | null {
  for (const d of w.dzieci ?? []) {
    if (d.tag === '#text') continue;
    if (warunek(d)) return d;
    const z = znajdzWezel(d, warunek);
    if (z) return z;
  }
  return null;
}

function czyRamkaObrazu(w: Wezel): boolean {
  return (w.tag === 'div' || w.tag === 'figure') && maKlase(w, 'ob');
}

function przyciskZ(w: Wezel, k: KontekstKonwersji): string {
  const klasyLinku = klasy(w).map((x) => prefiksKlas(x));
  return b.przycisk({ klasa: klasyLinku.join(' ') }, adresLinku(w.atrybuty.href ?? '#', k), htmlZPrzestrzenia(w.dzieci ?? [], k));
}

/** Lista węzłów → bloki. Ciągi węzłów wierszowych stają się akapitami. */
export function bloki(wezly: Wezel[], k: KontekstKonwersji): string[] {
  const wynik: string[] = [];
  let ciag: Wezel[] = [];
  // Kontener z treścią mieszaną (np. <div class="poz"><h3>…</h3><span class="kropki"></span><strong class="poz-cena">…)
  // to zwykle układ flex/grid: elementy z klasami zostają osobnymi dziećmi kontenera (każdy we własnym akapicie albo –
  // pusty element ozdobny – jako HTML), a nie jednym akapitem – inaczej rozjechałby się układ.
  const mieszane = wezly.some((w) => !wierszowy(w));
  const zamknijCiag = () => {
    const c = przytnij(ciag).filter((w) => !bialy(w));
    ciag = [];
    if (!c.length) return;
    if (mieszane && c.every((w) => w.tag !== '#text' && w.tag !== 'a' && !!w.atrybuty.class && !znajdzWezel(w, (x) => x.tag === 'a'))) {
      for (const w of c) {
        if (!tekstWezla(w).trim()) wynik.push(b.html(htmlZPrzestrzenia([w], k)));
        // Akapit-opakowanie bez klasy: element zostaje z klasami w środku – reguły typu `.kroki li p` trafiają
        // w opakowanie, a reguły klasy elementu (np. `.krok-cyfra`) dalej w sam element.
        else wynik.push(b.akapit({}, htmlZPrzestrzenia([w], k)));
      }
      return;
    }
    wynik.push(b.akapit({}, htmlZPrzestrzenia(c, k)));
  };
  for (const w of wezly) {
    if (wierszowy(w)) {
      ciag.push(w);
      continue;
    }
    zamknijCiag();
    const blok = blokZ(w, k);
    if (blok) wynik.push(blok);
  }
  zamknijCiag();
  return wynik;
}

function przytnij(ciag: Wezel[]): Wezel[] {
  const c = [...ciag];
  while (c.length && bialy(c[0]!)) c.shift();
  while (c.length && bialy(c[c.length - 1]!)) c.pop();
  return c;
}

const elementy = (w: Wezel) => (w.dzieci ?? []).filter((d) => !bialy(d));

/** Jeden element blokowy → blok (albo '' dla pominiętych). */
export function blokZ(w: Wezel, k: KontekstKonwersji): string {
  if (POMIJANE_KLASY.some((c) => maKlase(w, c))) return '';
  if (SUROWE.has(w.tag) || w.tag === 'picture') return b.html(htmlZPrzestrzenia([w], k));
  if (w.tag === 'img') return obrazZRamki({ tag: 'div', atrybuty: {}, kolejnosc: [], dzieci: [w] }, k);
  if (czyPrzycisk(w)) return b.przyciski({}, [przyciskZ(w, k)]);
  // Element wierszowy z treścią blokową (np. <span> z ikoną SVG, link z ikoną) – w całości jako HTML.
  if (INLINE.has(w.tag)) return b.html(htmlZPrzestrzenia([w], k));

  const kotwica = w.atrybuty.id;
  if (/^h[1-6]$/.test(w.tag)) return b.naglowek(Number(w.tag[1]), { klasa: klasyBloku(w), kotwica }, htmlZPrzestrzenia(w.dzieci ?? [], k));
  if (w.tag === 'p') {
    if ((w.dzieci ?? []).every(wierszowy)) return b.akapit({ klasa: klasyBloku(w), kotwica }, htmlZPrzestrzenia(przytnij(w.dzieci ?? []), k));
    return b.html(htmlZPrzestrzenia([w], k));
  }
  if (czyRamkaObrazu(w)) return obrazZRamki(w, k);
  if (w.tag === 'details') return szczegolyZ(w, k);
  if (w.tag === 'blockquote') return b.cytat({ klasa: klasyBloku(w) }, bloki(w.dzieci ?? [], k).join('\n'));

  const dzieci = elementy(w);
  // Kontener samych przycisków (div.akcje, pasek CTA, akcja pakietu) → core/buttons.
  if (dzieci.length && dzieci.every(czyPrzycisk)) {
    return b.przyciski({ klasa: klasyBloku(w) }, dzieci.map((d) => przyciskZ(d, k)));
  }
  if (w.tag === 'ul' || w.tag === 'ol') {
    const specjalna = listaSpecjalna(w, dzieci, k);
    if (specjalna !== null) return specjalna;
  }
  // Kontener z samą treścią wierszową → akapit z klasami kontenera (np. dt, dd, figcaption, pas nazwy pakietu).
  if (!(w.tag in GRUPY) && dzieci.length && (w.dzieci ?? []).every(wierszowy)) {
    return b.akapit({ klasa: klasyBloku(w), kotwica }, htmlZPrzestrzenia(przytnij(w.dzieci ?? []), k));
  }
  return b.grupa({ tag: GRUPY[w.tag] ?? 'div', klasa: klasyBloku(w), kotwica }, bloki(w.dzieci ?? [], k).join('\n'));
}

/** FAQ: <details><summary><h3>Pytanie</h3>…</summary><div class="faq-odp">…</div></details> → core/details. */
function szczegolyZ(w: Wezel, k: KontekstKonwersji): string {
  const summary = (w.dzieci ?? []).find((d) => d.tag === 'summary');
  const h = summary ? znajdzWezel(summary, (x) => /^h[1-6]$/.test(x.tag)) : null;
  const tytul = h ? htmlZPrzestrzenia(h.dzieci ?? [], k) : summary ? htmlZPrzestrzenia((summary.dzieci ?? []).filter(wierszowy), k) : '';
  const reszta = (w.dzieci ?? []).filter((d) => d !== summary);
  return b.szczegoly({ klasa: klasyBloku(w), otwarte: 'open' in w.atrybuty }, tytul, bloki(reszta, k).join('\n'));
}

/**
 * Listy z osobnym blokiem: galeria zdjęć z biblioteki → core/gallery, pakiety cennika → core/columns,
 * prosta lista tekstowa → core/list. null = zwykła grupa.
 */
function listaSpecjalna(w: Wezel, dzieci: Wezel[], k: KontekstKonwersji): string | null {
  const li = dzieci.filter((d) => d.tag === 'li');
  if (li.length !== dzieci.length || !li.length) return null;
  const ramki = li.map((x) => elementy(x));
  const galeria = ['galeria-kafle', 'mozaika', 'galeria-tor'].some((c) => maKlase(w, c));
  if (galeria && ramki.every((r) => r.length === 1 && czyRamkaObrazu(r[0]!) && !!znajdzWezel(r[0]!, (x) => x.tag === 'img' && (x.atrybuty.src ?? '').includes(TOKEN_MEDIUM)))) {
    return b.galeria({ klasa: klasyBloku(w) }, ramki.map((r) => obrazZRamki(r[0]!, k, ['vke-li'])));
  }
  if (maKlase(w, 'pakiety')) {
    return b.kolumny({ klasa: klasyBloku(w) }, li.map((x) => b.kolumna({ klasa: klasyBloku(x) }, bloki(x.dzieci ?? [], k).join('\n'))));
  }
  const proste = li.every((x) => !x.atrybuty.class && (x.dzieci ?? []).every(wierszowy)) && w.kolejnosc.every((a) => a === 'class');
  if (proste) {
    return b.lista({ klasa: klasyBloku(w).replace(/(^| )vke-(ul|ol)( |$)/, '$1').trim(), numerowana: w.tag === 'ol' }, li.map((x) => htmlZPrzestrzenia(przytnij(x.dzieci ?? []), k)));
  }
  return null;
}

/** Bloki najwyższego poziomu treści dostają klasę zakresu `vk` (reguły na znacznikach z arkusza kreatora). */
export function blokiTresci(wezly: Wezel[], k: KontekstKonwersji): string {
  return wezly
    .filter((w) => !bialy(w))
    .map((w) => (w.tag === '#text' ? w : { ...w, atrybuty: { ...w.atrybuty, class: `${KLASA_ZAKRESU} ${w.atrybuty.class ?? ''}`.trim() }, kolejnosc: w.kolejnosc.includes('class') ? w.kolejnosc : ['class', ...w.kolejnosc] }))
    .flatMap((w) => bloki([w], k))
    .join('\n\n');
}

