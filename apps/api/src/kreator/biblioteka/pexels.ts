import { BladDostawcy, NIE_MA_ZDJECIA, https, liczba, pobierzJson, tekst, type DostawcaZdjec, type Fetch, type WynikWyszukiwania, type WynikZdjecia, type ZdjecieDoPobrania } from './dostawca.js';

/**
 * Pexels – https://www.pexels.com/api/documentation/ (do sprawdzenia z dokumentacją przy wdrożeniu). Adapter gotowy,
 * WYŁĄCZONY bez PEXELS_API_KEY (11.2026 Pexels wstrzymał wydawanie nowych kluczy).
 * GET https://api.pexels.com/v1/search?query=…&per_page=…&page=…  (nagłówek Authorization: KEY)
 * GET https://api.pexels.com/v1/photos/<id>
 * Pola: photos[].id, width, height, photographer, photographer_url, url (strona zdjęcia), src.original/large2x/medium;
 * total_results. Licencja Pexels – bez obowiązku podpisu.
 */
const API = 'https://api.pexels.com/v1/';
const LICENCJA_URL = 'https://www.pexels.com/license/';

interface Zdjecie {
  id?: unknown;
  width?: unknown;
  height?: unknown;
  photographer?: unknown;
  photographer_url?: unknown;
  url?: unknown;
  src?: { original?: unknown; large2x?: unknown; medium?: unknown };
}

export class DostawcaPexels implements DostawcaZdjec {
  readonly nazwa = 'pexels' as const;
  readonly etykieta = 'Pexels';
  readonly hosty = ['images.pexels.com'] as const;

  constructor(
    private readonly klucz: string | undefined,
    readonly f: Fetch = fetch,
  ) {}

  wlaczony(): boolean {
    return !!this.klucz;
  }

  private naglowki(): Record<string, string> {
    if (!this.klucz) throw new BladDostawcy('Ta biblioteka zdjęć nie jest teraz dostępna.', 'brak klucza');
    return { Authorization: this.klucz };
  }

  private mapuj(z: Zdjecie): (WynikZdjecia & { oryginal: string }) | null {
    const id = tekst(z.id, 20);
    const miniatura = https(z.src?.medium);
    const oryginal = https(z.src?.original);
    const zrodloUrl = https(z.url);
    if (!/^\d+$/.test(id) || !miniatura || !oryginal || !zrodloUrl) return null;
    const autorUrl = https(z.photographer_url);
    return {
      id,
      miniatura,
      szerokosc: liczba(z.width),
      wysokosc: liczba(z.height),
      autor: tekst(z.photographer, 120) || 'Pexels',
      ...(autorUrl ? { autorUrl } : {}),
      licencja: 'pexels',
      licencjaUrl: LICENCJA_URL,
      zrodloUrl,
      oryginal,
    };
  }

  async szukaj(q: string, strona: number, naStrone: number): Promise<WynikWyszukiwania> {
    const p = new URLSearchParams({ query: q.slice(0, 100), per_page: String(naStrone), page: String(strona) });
    const r = await pobierzJson<{ total_results?: unknown; photos?: Zdjecie[] }>(this.f, `${API}search?${p.toString()}`, this.naglowki());
    const wyniki = (Array.isArray(r.photos) ? r.photos : []).map((x) => this.mapuj(x)).filter((w): w is WynikZdjecia & { oryginal: string } => !!w);
    return { wyniki: wyniki.map(({ oryginal: _o, ...w }) => w), razem: liczba(r.total_results) };
  }

  async pobierz(id: string): Promise<ZdjecieDoPobrania> {
    if (!/^\d{1,20}$/.test(id)) throw new BladDostawcy(NIE_MA_ZDJECIA, 'zły identyfikator');
    const w = this.mapuj(await pobierzJson<Zdjecie>(this.f, `${API}photos/${id}`, this.naglowki()));
    if (!w) throw new BladDostawcy(NIE_MA_ZDJECIA, 'niepełne dane');
    const { id: _i, miniatura: _m, oryginal, ...meta } = w;
    // Oryginał bywa ogromny – parametry obrazów Pexels zmniejszają go po stronie dostawcy do 2400 px szerokości.
    const u = new URL(oryginal);
    u.searchParams.set('auto', 'compress');
    u.searchParams.set('cs', 'tinysrgb');
    u.searchParams.set('w', '2400');
    return { url: u.toString(), meta };
  }
}
