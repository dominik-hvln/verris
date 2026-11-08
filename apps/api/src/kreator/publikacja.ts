import { createHash } from 'node:crypto';

/**
 * Verris Kreator – publikacja (paczka 121): czyste funkcje bez Nesta i bez sieci. Ścieżki, znacznik katalogu,
 * klasyfikacja zawartości katalogu domeny, nazwa kopii, kolejka z limitem równoległości, strona linku podglądu.
 */

/** Plik znacznika w katalogu strony: id strony i lista plików kreatora (zapisywany przy każdej publikacji). */
export const PLIK_ZNACZNIKA = '.verris-kreator.json';
/** Prefiks katalogu kopii poprzedniej zawartości (obok public_html, poza katalogiem serwowanym przez WWW). */
export const PREFIKS_KOPII = '.verris-kopia-';
/** Katalog fontów strony (względem korzenia strony) – ten sam co `bazaFontow` renderu publikacji. */
export const KATALOG_FONTOW = 'assets/fonty';

/**
 * Paczka 122 – zdjęcia z biblioteki: każde to do 8 plików (4 szerokości × webp/jpg, razem zwykle 1–2 MB), stąd
 * limity podniesione z 400 plików / 20 MB do 800 / 60 MB (galeria 24 zdjęć + hero i sekcje ≈ 40 zdjęć).
 */
export const LIMIT_PLIKOW = 800;
export const LIMIT_BAJTOW = 60 * 1024 * 1024;
/** Równoległe zapisy na koncie hostingu (menedżer plików węzła) i równoległe pobrania fontów. */
export const ROWNOLEGLOSC = 4;

/**
 * Wpisy katalogu domeny, których publikacja nie liczy jako „cudze” i nigdy nie przenosi do kopii:
 * `.well-known` – wyzwania ACME (odnowienie certyfikatu SSL w trakcie publikacji), `cgi-bin` – pusty katalog
 * zakładany przez serwer przy każdej domenie, znacznik kreatora i ewentualne kopie.
 */
const POMIJANE = new Set(['.well-known', 'cgi-bin', PLIK_ZNACZNIKA]);

export interface PlikPublikacji {
  /** Względem korzenia strony, np. 'index.html', 'o-nas/index.html', 'assets/fonty/inter-400-latin.woff2'. */
  sciezka: string;
  dane: Buffer;
  /** Tekst (HTML/CSS/JS/XML) zapisujemy edycją pliku, binaria (fonty) – wgraniem. */
  tekst: boolean;
}

export interface Znacznik {
  stronaId: string;
  pliki: string[];
  at: string;
  /** Publikacja w toku (znacznik zapisany przed plikami – przerwaną publikację następna rozpozna jako własną). */
  wToku?: boolean;
}

// ---------------------------------------------------------------------------------------------------------------
// Ścieżki
// ---------------------------------------------------------------------------------------------------------------

const SEGMENT = /^[a-z0-9-][a-z0-9.-]{0,79}$/;

/**
 * Ścieżka pliku z renderu przed zapisem na hosting: tylko [a-z0-9-/._], względna, bez '..', bez pustych
 * segmentów i bez plików ukrytych (renderer ich nie tworzy – .htaccess albo znacznik w renderze to błąd).
 * Zwraca opis błędu albo null.
 */
export function bladSciezki(sciezka: string): string | null {
  if (typeof sciezka !== 'string' || !sciezka) return 'pusta ścieżka';
  if (sciezka.length > 200) return 'za długa ścieżka';
  if (!/^[a-z0-9\-/._]+$/.test(sciezka)) return 'niedozwolone znaki';
  if (sciezka.startsWith('/')) return 'ścieżka bezwzględna';
  const czesci = sciezka.split('/');
  if (czesci.length > 5) return 'za głęboko';
  for (const c of czesci) {
    if (c === '' || c === '.' || c === '..') return 'nieprawidłowy segment';
    if (!SEGMENT.test(c)) return 'nieprawidłowa nazwa';
  }
  return null;
}

export class BladPlikowPublikacji extends Error {}

/** Sprawdza komplet plików publikacji: ścieżki, duplikaty, limity liczby i rozmiaru. Rzuca BladPlikowPublikacji. */
export function sprawdzPliki(pliki: PlikPublikacji[]): void {
  if (pliki.length > LIMIT_PLIKOW) throw new BladPlikowPublikacji(`Strona ma za dużo plików (${pliki.length}, limit ${LIMIT_PLIKOW}).`);
  const widziane = new Set<string>();
  let bajty = 0;
  for (const p of pliki) {
    const b = bladSciezki(p.sciezka);
    if (b) throw new BladPlikowPublikacji(`Nieprawidłowa ścieżka pliku w renderze (${b}).`);
    if (widziane.has(p.sciezka)) throw new BladPlikowPublikacji('Powtórzona ścieżka pliku w renderze.');
    widziane.add(p.sciezka);
    bajty += p.dane.length;
  }
  // Plik i katalog o tej samej nazwie („o-nas” i „o-nas/index.html”) – zapis jednego zniszczyłby drugi.
  for (const s of widziane) {
    const czesci = s.split('/');
    for (let i = 1; i < czesci.length; i++) {
      if (widziane.has(czesci.slice(0, i).join('/'))) throw new BladPlikowPublikacji('Plik i katalog o tej samej nazwie w renderze.');
    }
  }
  if (bajty > LIMIT_BAJTOW) throw new BladPlikowPublikacji(`Strona jest za duża (${(bajty / 1048576).toFixed(1)} MB, limit ${LIMIT_BAJTOW / 1048576} MB).`);
}

/** Katalogi do utworzenia (rodzice przed dziećmi) dla listy plików. */
export function katalogiPlikow(sciezki: string[]): string[] {
  const k = new Set<string>();
  for (const s of sciezki) {
    const czesci = s.split('/');
    for (let i = 1; i < czesci.length; i++) k.add(czesci.slice(0, i).join('/'));
  }
  return [...k].sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b));
}

/** Łączy katalog konta i ścieżkę względną. */
export const polacz = (katalog: string, sciezka: string) => (sciezka ? `${katalog.replace(/\/+$/, '')}/${sciezka}` : katalog);
export const rodzic = (sciezka: string) => (sciezka.includes('/') ? sciezka.slice(0, sciezka.lastIndexOf('/')) : '');
export const nazwa = (sciezka: string) => sciezka.slice(sciezka.lastIndexOf('/') + 1);

// ---------------------------------------------------------------------------------------------------------------
// Znacznik i stan katalogu
// ---------------------------------------------------------------------------------------------------------------

export function zbudujZnacznik(stronaId: string, pliki: string[], wToku = false, teraz = new Date()): string {
  const z: Znacznik = { stronaId, pliki: [...new Set(pliki)].sort(), at: teraz.toISOString(), ...(wToku ? { wToku: true } : {}) };
  return `${JSON.stringify(z, null, 2)}\n`;
}

/** Znacznik z pliku; śmieci i ścieżki spoza reguł = null (nie usuwamy niczego na podstawie podejrzanej listy). */
export function odczytajZnacznik(tresc: string | null | undefined): Znacznik | null {
  if (!tresc) return null;
  try {
    const z = JSON.parse(tresc) as Partial<Znacznik>;
    if (!z || typeof z.stronaId !== 'string' || !/^[0-9a-f-]{36}$/.test(z.stronaId) || !Array.isArray(z.pliki)) return null;
    if (!z.pliki.every((p) => typeof p === 'string' && bladSciezki(p) === null)) return null;
    return { stronaId: z.stronaId, pliki: z.pliki as string[], at: String(z.at ?? ''), ...(z.wToku ? { wToku: true } : {}) };
  } catch {
    return null;
  }
}

export interface WpisKatalogu {
  name: string;
  type: 'file' | 'dir';
}

/**
 * Wpisy katalogu domeny nie pochodzące z kreatora: wszystko poza pomijanymi, katalogami poddomen (`chronione` –
 * serwer trzyma poddomeny w public_html/<poddomena>), kopiami i – gdy znacznik należy do tej strony –
 * plikami z jego listy.
 */
export function obceWpisy(wpisy: WpisKatalogu[], znacznik: Znacznik | null, stronaId: string, chronione: string[] = []): WpisKatalogu[] {
  const wlasne = new Set(znacznik && znacznik.stronaId === stronaId ? znacznik.pliki.map((p) => p.split('/')[0]) : []);
  const chr = new Set(chronione.map((c) => c.toLowerCase()));
  return wpisy.filter((w) => !POMIJANE.has(w.name) && !w.name.startsWith(PREFIKS_KOPII) && !chr.has(w.name.toLowerCase()) && !wlasne.has(w.name));
}

/** Pliki zaślepki nowej domeny (strona „Witamy” serwera): index.html, logo, katalog assets z grafikami Verris. */
const ZASLEPKA = new Set(['index.html', 'logo.png', 'assets']);

/** Czy treść index.html to strona powitalna serwera (te same wzorce co ops/scripts/install-verris-default-page.sh). */
export function czyIndexZaslepki(html: string): boolean {
  const t = html.toLowerCase();
  if (t.includes('witamy na stronie') && (t.includes('hosting verris') || t.includes('|domain|'))) return true;
  return /directadmin|something amazing will be constructed/.test(t);
}

/** Czy obce wpisy to tylko zaślepka nowej domeny (wtedy kopia bez pytania – wycofanie przywraca zaślepkę). */
export function tylkoZaslepka(obce: WpisKatalogu[], indexHtml: string | null, assets: WpisKatalogu[] | null): boolean {
  if (!obce.length || !obce.every((w) => ZASLEPKA.has(w.name))) return false;
  if (!obce.some((w) => w.name === 'index.html' && w.type === 'file') || indexHtml === null || !czyIndexZaslepki(indexHtml)) return false;
  if (obce.some((w) => w.name === 'assets')) {
    if (!assets || !assets.every((a) => a.type === 'file' && /^verris-[a-z0-9-]+\.svg$/.test(a.name))) return false;
  }
  return true;
}

export type StanKatalogu = 'pusta' | 'zajeta' | 'kreator' | 'nieznany';

// ---------------------------------------------------------------------------------------------------------------
// Kopia, osierocone pliki
// ---------------------------------------------------------------------------------------------------------------

/** `.verris-kopia-RRRRMMDD-HHMM` w czasie polskim (klient rozpozna kopię po godzinie publikacji). */
export function nazwaKopii(teraz = new Date()): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(teraz)
      .map((x) => [x.type, x.value]),
  );
  return `${PREFIKS_KOPII}${p.year}${p.month}${p.day}-${p.hour}${p.minute}`;
}

/** Pliki poprzedniej publikacji, których nie ma w nowej (do usunięcia), pogrupowane po katalogu. */
export function osierocone(stare: string[], nowe: string[]): Map<string, string[]> {
  const n = new Set(nowe);
  const wynik = new Map<string, string[]>();
  for (const s of stare) {
    if (n.has(s)) continue;
    const k = rodzic(s);
    wynik.set(k, [...(wynik.get(k) ?? []), nazwa(s)]);
  }
  return wynik;
}

/** Kolejka z limitem równoległości; pierwszy błąd zatrzymuje dalsze zadania i wraca po zakończeniu trwających. */
export async function wKolejce<T, W>(elementy: T[], limit: number, fn: (e: T) => Promise<W>): Promise<W[]> {
  const wyniki: W[] = new Array(elementy.length);
  let i = 0;
  let blad: unknown = null;
  const pracownik = async () => {
    while (blad === null && i < elementy.length) {
      const nr = i++;
      try {
        wyniki[nr] = await fn(elementy[nr]);
      } catch (e) {
        if (blad === null) blad = e;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, elementy.length) }, pracownik));
  if (blad !== null) throw blad;
  return wyniki;
}

// ---------------------------------------------------------------------------------------------------------------
// Link podglądu wersji próbnej
// ---------------------------------------------------------------------------------------------------------------

export const PASEK_PROBY = 'Wersja próbna – strona widoczna tylko pod tym adresem';

/** Pasek wersji próbnej wstawiany zaraz po <body> (style inline – CSP dopuszcza style inline, nie skrypty). */
export function wstawPasekProby(html: string): string {
  const pasek =
    '<div role="note" style="position:sticky;top:0;z-index:2147483647;margin:0;padding:8px 16px;background:#0f172a;color:#fff;' +
    'font:600 14px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;text-align:center">' +
    `${PASEK_PROBY}</div>`;
  const m = /<body\b[^>]*>/i.exec(html);
  return m ? html.slice(0, m.index + m[0].length) + pasek + html.slice(m.index + m[0].length) : pasek + html;
}

/** Skróty sha256 treści skryptów inline (CSP script-src bez 'unsafe-inline'). */
export function skrotySkryptow(html: string): string[] {
  const s = new Set<string>();
  for (const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    s.add(`'sha256-${createHash('sha256').update(m[1], 'utf8').digest('base64')}'`);
  }
  return [...s];
}

/**
 * Nagłówki strony z linku podglądu: bez sandboxu (strona otwierana w karcie, nie w ramce), ale tylko nasze skrypty
 * (skróty), żadnych połączeń sieciowych poza fontami z API i obrazami https, bez formularzy, noindex.
 */
export function naglowkiLinkuPodgladu(html: string | null, bazaFontow: string): Record<string, string> {
  const fonty = URL.canParse(bazaFontow) ? new URL(bazaFontow).origin : '';
  const skroty = html ? skrotySkryptow(html) : [];
  const csp = [
    "default-src 'none'",
    `script-src ${skroty.length ? skroty.join(' ') : "'none'"}`,
    "style-src 'unsafe-inline'",
    `font-src data:${fonty ? ` ${fonty}` : ''}`,
    `img-src https: data:${fonty.startsWith('http:') ? ` ${fonty}` : ''}`,
    "connect-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
  return {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': csp,
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  };
}

/** Prosta strona komunikatu (link wygasł, link nie działa) – bez skryptów, bez zasobów zewnętrznych. */
export function stronaKomunikatu(tytul: string, tresc: string): string {
  return (
    '<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    `<meta name="robots" content="noindex, nofollow"><title>${tytul}</title>` +
    '<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f8fafc;color:#0f172a;font:16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}' +
    'main{max-width:32rem;padding:2rem}h1{font-size:1.5rem;margin:0 0 .5rem}p{margin:0;color:#475569}</style></head>' +
    `<body><main><h1>${tytul}</h1><p>${tresc}</p></main></body></html>`
  );
}
