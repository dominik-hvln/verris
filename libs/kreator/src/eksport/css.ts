/**
 * Przestrzeń nazw klas dla arkusza renderera w motywie CMS (paczka 124).
 *
 * Arkusz strony statycznej (render/css.ts) używa krótkich klas (`.btn`, `.nav`, `.karta`) i reguł na znacznikach
 * (`ul{list-style:none}`, `p{margin:0}`). W WordPressie zderzyłyby się z klasami wtyczek i rozjechały treść, którą
 * klient dopisze sam (lista bez punktorów w zwykłym wpisie). Dlatego:
 *  - każda klasa dostaje prefiks `vk-` (`.btn` → `.vk-btn`), oprócz klas stanu ustawianych przez skrypt (`.js`);
 *  - reguły zaczynające się od znacznika działają tylko wewnątrz bloków z kreatora: `:where(.vk) p` (bez zmiany
 *    specyficzności), `html`, `body`, `:root` i `*` zostają globalne;
 *  - znaczniki, których bloki WordPressa nie potrafią odtworzyć (element listy jako grupa z blokami w środku,
 *    `dt`/`dd`, `figure` z dowolną treścią), są w selektorach zastępowane przez `:is(li,.vke-li)` – konwerter
 *    bloków nadaje grupom klasę `vke-<znacznik>`;
 *  - przycisk: klasy `.btn*` stoją w WordPressie na opakowaniu `div.wp-block-button`, a wygląd dostaje link
 *    w środku – każda reguła z `.btn*` ma drugi wariant `.wp-block-button.vk-btn>.wp-block-button__link`.
 */
export const PREFIKS_KLAS = 'vk-';
/** Klasa zakresu: bloki z kreatora (sekcje, nagłówek, stopka) – reguły na znacznikach działają tylko w nich. */
export const KLASA_ZAKRESU = 'vk';
/** Klasy ustawiane przez skrypt albo WordPressa – bez prefiksu. */
const BEZ_PREFIKSU = new Set(['js', 'vk']);
/** Znaczniki zastępowane w selektorach przez `:is(znacznik,.vk-znacznik)`. */
export const ZNACZNIKI_ZASTEPCZE = new Set(['li', 'ul', 'ol', 'dl', 'dt', 'dd', 'figure', 'figcaption', 'address', 'nav', 'article']);
/** Prefiks klasy zastępującej znacznik (inny niż klas renderera – renderer ma np. klasę `nav`). */
export const PREFIKS_ZNACZNIKA = 'vke-';
export const klasaZnacznika = (tag: string) => `${PREFIKS_ZNACZNIKA}${tag}`;
const GLOBALNE = new Set(['html', 'body', ':root', '*']);

export function prefiksKlasy(klasa: string): string {
  return BEZ_PREFIKSU.has(klasa) || klasa.startsWith(PREFIKS_KLAS) || klasa.startsWith('vke-') ? klasa : `${PREFIKS_KLAS}${klasa}`;
}

/** Klasy w atrybucie class (HTML z renderera) z prefiksem. */
export function prefiksKlas(lista: string): string {
  return lista
    .split(/\s+/)
    .filter(Boolean)
    .map(prefiksKlasy)
    .join(' ');
}

/** Podział po przecinkach najwyższego poziomu (bez przecinków w nawiasach, np. `:is(a,b)`). */
function podziel(tekst: string, znak: string): string[] {
  const wynik: string[] = [];
  let glebokosc = 0;
  let start = 0;
  for (let i = 0; i < tekst.length; i++) {
    const c = tekst[i];
    if (c === '(' || c === '[') glebokosc++;
    else if (c === ')' || c === ']') glebokosc--;
    else if (c === znak && glebokosc === 0) {
      wynik.push(tekst.slice(start, i));
      start = i + 1;
    }
  }
  wynik.push(tekst.slice(start));
  return wynik;
}

const PSEUDO_Z_SELEKTOREM = /^:(not|is|where|has)\($/;

/**
 * Jeden selektor złożony: klasy z prefiksem, znaczniki zastępcze, selektory w :not()/:is()/:where()/:has().
 * Zwraca też, czy pierwszy element to znacznik (do zawężenia zakresem).
 */
function przeksztalcSelektor(sel: string): string {
  let wynik = '';
  let i = 0;
  const n = sel.length;
  // Czy jesteśmy na początku selektora prostego (po kombinatorze albo na starcie).
  let poczatek = true;
  while (i < n) {
    const c = sel[i]!;
    if (c === '.') {
      let j = i + 1;
      while (j < n && /[A-Za-z0-9_-]/.test(sel[j]!)) j++;
      wynik += `.${prefiksKlasy(sel.slice(i + 1, j))}`;
      i = j;
      poczatek = false;
      continue;
    }
    if (c === ':') {
      // pseudoklasa/pseudoelement; selektory w nawiasach przekształcamy rekurencyjnie
      let j = i + 1;
      if (sel[j] === ':') j++;
      while (j < n && /[A-Za-z0-9_-]/.test(sel[j]!)) j++;
      const nazwa = sel.slice(i, j);
      if (sel[j] === '(') {
        let glebokosc = 1;
        let k = j + 1;
        while (k < n && glebokosc) {
          if (sel[k] === '(') glebokosc++;
          else if (sel[k] === ')') glebokosc--;
          k++;
        }
        const srodek = sel.slice(j + 1, k - 1);
        wynik += PSEUDO_Z_SELEKTOREM.test(`${nazwa}(`) ? `${nazwa}(${podziel(srodek, ',').map((s) => przeksztalcSelektor(s.trim())).join(',')})` : `${nazwa}(${srodek})`;
        i = k;
      } else {
        wynik += nazwa;
        i = j;
      }
      poczatek = false;
      continue;
    }
    if (c === '[') {
      const k = sel.indexOf(']', i);
      wynik += sel.slice(i, k + 1);
      i = k + 1;
      poczatek = false;
      continue;
    }
    if (/[\s>+~]/.test(c)) {
      wynik += c;
      i++;
      poczatek = true;
      continue;
    }
    if (/[A-Za-z]/.test(c) && poczatek) {
      let j = i;
      while (j < n && /[A-Za-z0-9-]/.test(sel[j]!)) j++;
      const tag = sel.slice(i, j).toLowerCase();
      wynik += ZNACZNIKI_ZASTEPCZE.has(tag) ? `:is(${tag},.${klasaZnacznika(tag)})` : sel.slice(i, j);
      i = j;
      poczatek = false;
      continue;
    }
    wynik += c;
    i++;
    poczatek = false;
  }
  return wynik;
}

/** Klasa przycisku po przekształceniu (`.vk-btn`, `.vk-btn-1`, `.vk-btn-maly`…). */
const KLASA_PRZYCISKU = /\.(vk-btn(?:-[a-z0-9]+)?)(?![A-Za-z0-9_-])/;

/** Wariant reguły przycisku dla bloku core/button: klasy na opakowaniu, wygląd na linku w środku. */
function wariantPrzycisku(sel: string): string | null {
  if (!KLASA_PRZYCISKU.test(sel)) return null;
  // Rozbijamy na selektory proste rozdzielone kombinatorami (spacja, >, +, ~ – poza nawiasami).
  const czesci: string[] = [];
  let glebokosc = 0;
  let biezacy = '';
  for (const c of sel) {
    if (c === '(' || c === '[') glebokosc++;
    if (c === ')' || c === ']') glebokosc--;
    if (glebokosc === 0 && /[\s>+~]/.test(c)) {
      if (biezacy) czesci.push(biezacy);
      czesci.push(c);
      biezacy = '';
      continue;
    }
    biezacy += c;
  }
  if (biezacy) czesci.push(biezacy);
  return czesci
    .map((cz) => {
      if (!KLASA_PRZYCISKU.test(cz)) return cz;
      // pseudoklasy (:hover, :disabled, :focus-visible) i pseudoelementy przechodzą na link
      const m = /^([^:]*)(:.*)?$/.exec(cz)!;
      return `.wp-block-button${m[1]}>.wp-block-button__link${m[2] ?? ''}`;
    })
    .join('');
}

/** Lista selektorów reguły → lista po przekształceniu (z zakresem i wariantem przycisku). */
export function przeksztalcSelektory(lista: string): string {
  const wynik: string[] = [];
  for (const surowy of podziel(lista, ',')) {
    const sel = surowy.trim();
    if (!sel) continue;
    const pierwszy = /^([A-Za-z][A-Za-z0-9-]*|:root|\*)/.exec(sel)?.[1]?.toLowerCase();
    const zakres = pierwszy && !GLOBALNE.has(pierwszy) ? `:where(.${KLASA_ZAKRESU}) ` : '';
    const t = przeksztalcSelektor(sel);
    const przycisk = wariantPrzycisku(t);
    if (przycisk) {
      // Oryginał nie trafia w opakowanie bloku (podwójne tło i odstępy) – tylko w <a>/<button> z HTML formularza.
      wynik.push(zakres + t.replace(new RegExp(KLASA_PRZYCISKU.source, 'g'), '.$1:not(.wp-block-button)'), zakres + przycisk);
    } else {
      wynik.push(zakres + t);
    }
  }
  return wynik.join(',');
}

/**
 * Cały arkusz: reguły (także w @media, @supports, @container) z przestrzenią nazw; @font-face usunięte
 * (fonty deklaruje theme.json motywu), @keyframes bez zmian.
 */
export function przestrzenNazwCss(css: string): string {
  let wynik = '';
  let i = 0;
  const n = css.length;
  while (i < n) {
    // komentarze
    if (css.startsWith('/*', i)) {
      const k = css.indexOf('*/', i + 2);
      i = k < 0 ? n : k + 2;
      continue;
    }
    const klamra = znajdzPozaCudzyslowem(css, '{', i);
    if (klamra < 0) break;
    const prelude = css.slice(i, klamra).trim();
    const koniec = domkniecie(css, klamra);
    const srodek = css.slice(klamra + 1, koniec);
    if (prelude.startsWith('@font-face')) {
      // pomijamy
    } else if (/^@(media|supports|container|layer)\b/.test(prelude)) {
      wynik += `${prelude}{${przestrzenNazwCss(srodek)}}\n`;
    } else if (prelude.startsWith('@')) {
      wynik += `${prelude}{${srodek}}\n`;
    } else if (prelude) {
      wynik += `${przeksztalcSelektory(prelude)}{${srodek}}\n`;
    }
    i = koniec + 1;
  }
  return wynik;
}

function znajdzPozaCudzyslowem(tekst: string, znak: string, od: number): number {
  let cudzyslow: string | null = null;
  for (let i = od; i < tekst.length; i++) {
    const c = tekst[i]!;
    if (cudzyslow) {
      if (c === '\\') i++;
      else if (c === cudzyslow) cudzyslow = null;
      continue;
    }
    if (c === '"' || c === "'") cudzyslow = c;
    else if (c === znak) return i;
  }
  return -1;
}

/** Indeks klamry zamykającej blok otwarty w `otwarcie` (z zagnieżdżeniami i tekstami w cudzysłowach). */
function domkniecie(tekst: string, otwarcie: number): number {
  let glebokosc = 0;
  let cudzyslow: string | null = null;
  for (let i = otwarcie; i < tekst.length; i++) {
    const c = tekst[i]!;
    if (cudzyslow) {
      if (c === '\\') i++;
      else if (c === cudzyslow) cudzyslow = null;
      continue;
    }
    if (c === '"' || c === "'") cudzyslow = c;
    else if (c === '{') glebokosc++;
    else if (c === '}') {
      glebokosc--;
      if (glebokosc === 0) return i;
    }
  }
  throw new Error('CSS: niedomknięty blok');
}
