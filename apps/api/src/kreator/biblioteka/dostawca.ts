/**
 * Verris Kreator – biblioteki zdjęć niezależne od dostawcy (paczka 122). Pexels wstrzymał wydawanie nowych kluczy
 * API (11.2026), więc dostawcy są adapterami za jednym interfejsem: Pixabay (klucz), Openverse (bez klucza,
 * tylko CC0 i domena publiczna), Pexels (gotowy, wyłączony bez klucza). Zdjęcie wybrane przez klienta serwer
 * pobiera do magazynu Verris (import) – strona nigdy nie hotlinkuje dostawcy.
 */

export const DOSTAWCY_ZDJEC = ['pixabay', 'openverse', 'pexels'] as const;
export type NazwaDostawcy = (typeof DOSTAWCY_ZDJEC)[number];

export interface WynikZdjecia {
  id: string;
  /** Adres miniatury u dostawcy – do panelu trafia tylko przez proxy API. */
  miniatura: string;
  szerokosc: number;
  wysokosc: number;
  autor: string;
  autorUrl?: string;
  /** Kod licencji: 'pixabay', 'pexels', 'cc0', 'pdm'. */
  licencja: string;
  licencjaUrl?: string;
  /** Strona zdjęcia u dostawcy. */
  zrodloUrl: string;
}

export interface WynikWyszukiwania {
  wyniki: WynikZdjecia[];
  razem: number;
}

export interface ZdjecieDoPobrania {
  /** Adres pliku do importu (tylko https, host z listy `hosty` dostawcy). */
  url: string;
  meta: Omit<WynikZdjecia, 'id' | 'miniatura'>;
}

export interface DostawcaZdjec {
  readonly nazwa: NazwaDostawcy;
  /** Nazwa dla klienta (informacja o źródle przy wynikach). */
  readonly etykieta: string;
  /** Dostawca ma, czego potrzebuje (klucz API). */
  wlaczony(): boolean;
  /** Hosty, z których wolno pobrać plik zdjęcia i miniatury (dokładne nazwy albo `*.domena`). */
  readonly hosty: readonly string[];
  /** fetch używany do API i plików dostawcy (atrapa w testach). */
  readonly f: Fetch;
  szukaj(q: string, strona: number, naStrone: number): Promise<WynikWyszukiwania>;
  pobierz(id: string): Promise<ZdjecieDoPobrania>;
}

/** Błąd dostawcy – komunikat dla klienta po polsku, bez nazw kluczy i szczegółów (te idą do logu). */
export class BladDostawcy extends Error {
  constructor(
    message: string,
    readonly szczegoly = '',
  ) {
    super(message);
  }
}

export const BLAD_BIBLIOTEKI = 'Biblioteka zdjęć chwilowo nie odpowiada – spróbuj za chwilę albo wybierz inną bibliotekę.';
export const NIE_MA_ZDJECIA = 'Nie znaleziono tego zdjęcia w bibliotece – wyszukaj ponownie.';

export type Fetch = typeof fetch;

/** Czy host adresu jest na liście dostawcy (dokładnie albo poddomena dla wpisu `*.domena`). Tylko https. */
export function hostDozwolony(url: string, hosty: readonly string[]): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return false;
  const h = u.hostname.toLowerCase();
  return hosty.some((w) => (w.startsWith('*.') ? h.endsWith(w.slice(1)) && h.length > w.length - 1 : h === w));
}

/** JSON z API dostawcy z limitem czasu; status ≠ 2xx → BladDostawcy z polskim komunikatem. */
export async function pobierzJson<T>(f: Fetch, url: string, naglowki: Record<string, string> = {}, timeoutMs = 10_000): Promise<T> {
  let r: Response;
  try {
    r = await f(url, { headers: { Accept: 'application/json', ...naglowki }, redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    throw new BladDostawcy(BLAD_BIBLIOTEKI, e instanceof Error ? e.message : String(e));
  }
  if (r.status === 404) throw new BladDostawcy(NIE_MA_ZDJECIA, `HTTP 404`);
  if (r.status === 429) throw new BladDostawcy('Biblioteka zdjęć ma teraz za dużo zapytań – spróbuj za minutę.', 'HTTP 429');
  if (!r.ok) throw new BladDostawcy(BLAD_BIBLIOTEKI, `HTTP ${r.status}`);
  try {
    return (await r.json()) as T;
  } catch {
    throw new BladDostawcy(BLAD_BIBLIOTEKI, 'niepoprawny JSON');
  }
}

/**
 * Pobranie pliku zdjęcia/miniatury: tylko https z dozwolonych hostów (także po przekierowaniach – sprawdzamy każde,
 * najwyżej 3), limit rozmiaru (nagłówek i faktycznie odczytane bajty), limit czasu. SSRF: adresy spoza listy
 * dostawcy nie są w ogóle odpytywane.
 */
export async function pobierzPlik(f: Fetch, url: string, hosty: readonly string[], maksBajtow: number, timeoutMs = 20_000): Promise<{ dane: Buffer; typ: string }> {
  const sygnal = AbortSignal.timeout(timeoutMs);
  let adres = url;
  for (let skok = 0; ; skok++) {
    if (!hostDozwolony(adres, hosty)) throw new BladDostawcy('Tego zdjęcia nie da się zaimportować z tego serwisu – wybierz inne.', `host spoza listy: ${adres}`);
    let r: Response;
    try {
      r = await f(adres, { redirect: 'manual', signal: sygnal, headers: { Accept: 'image/*' } });
    } catch (e) {
      throw new BladDostawcy(BLAD_BIBLIOTEKI, e instanceof Error ? e.message : String(e));
    }
    if (r.status >= 300 && r.status < 400) {
      const dalej = r.headers.get('location');
      if (!dalej || skok >= 3) throw new BladDostawcy(BLAD_BIBLIOTEKI, 'za dużo przekierowań');
      adres = new URL(dalej, adres).toString();
      continue;
    }
    if (r.status === 404) throw new BladDostawcy(NIE_MA_ZDJECIA, 'HTTP 404');
    if (!r.ok || !r.body) throw new BladDostawcy(BLAD_BIBLIOTEKI, `HTTP ${r.status}`);
    const dl = Number(r.headers.get('content-length') ?? '0');
    if (dl > maksBajtow) throw new BladDostawcy('Zdjęcie w bibliotece jest za duże do importu – wybierz inne.', `content-length ${dl}`);
    const kawalki: Buffer[] = [];
    let razem = 0;
    const czytnik = r.body.getReader();
    for (;;) {
      const { done, value } = await czytnik.read();
      if (done) break;
      razem += value.byteLength;
      if (razem > maksBajtow) {
        await czytnik.cancel().catch(() => undefined);
        throw new BladDostawcy('Zdjęcie w bibliotece jest za duże do importu – wybierz inne.', `odczytano > ${maksBajtow}`);
      }
      kawalki.push(Buffer.from(value));
    }
    return { dane: Buffer.concat(kawalki), typ: r.headers.get('content-type') ?? '' };
  }
}

/** Liczba całkowita z JSON-a dostawcy (śmieci → 0). */
export const liczba = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0);
export const tekst = (v: unknown, max = 200): string => (typeof v === 'string' ? v.trim().slice(0, max) : typeof v === 'number' ? String(v) : '');
export const https = (v: unknown): string | undefined => (typeof v === 'string' && /^https:\/\//i.test(v) && v.length <= 1000 ? v : undefined);
