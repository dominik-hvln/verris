import { BladDostawcy, NIE_MA_ZDJECIA, https, liczba, pobierzJson, tekst, type DostawcaZdjec, type Fetch, type WynikWyszukiwania, type WynikZdjecia, type ZdjecieDoPobrania } from './dostawca.js';

/**
 * Pixabay – https://pixabay.com/api/docs/ (do sprawdzenia z dokumentacją przy wdrożeniu).
 * GET https://pixabay.com/api/?key=KEY&q=…&image_type=photo&safesearch=true&per_page=…&page=…&lang=pl
 * Pola: id, webformatURL (miniatura ~640 px, adres tymczasowy), largeImageURL (do 1280 px), imageWidth, imageHeight,
 * user, user_id, pageURL; `totalHits` = ile wyników da się przejrzeć. Zasady Pixabay: wyniki cache'ować 24 h,
 * nie hotlinkować na stałe (import pobiera plik do magazynu Verris), przy wynikach pokazywać, że pochodzą
 * z Pixabay; limit ok. 100 zapytań na minutę (pilnuje go BibliotekaZdjecService).
 */
const API = 'https://pixabay.com/api/';
const LICENCJA_URL = 'https://pixabay.com/service/license-summary/';

interface Trafienie {
  id?: unknown;
  webformatURL?: unknown;
  largeImageURL?: unknown;
  imageWidth?: unknown;
  imageHeight?: unknown;
  user?: unknown;
  user_id?: unknown;
  pageURL?: unknown;
}

export class DostawcaPixabay implements DostawcaZdjec {
  readonly nazwa = 'pixabay' as const;
  readonly etykieta = 'Pixabay';
  readonly hosty = ['pixabay.com', 'cdn.pixabay.com'] as const;

  constructor(
    private readonly klucz: string | undefined,
    readonly f: Fetch = fetch,
  ) {}

  wlaczony(): boolean {
    return !!this.klucz;
  }

  private adres(p: Record<string, string>): string {
    if (!this.klucz) throw new BladDostawcy('Ta biblioteka zdjęć nie jest teraz dostępna.', 'brak klucza');
    return `${API}?${new URLSearchParams({ key: this.klucz, ...p }).toString()}`;
  }

  private mapuj(t: Trafienie): (WynikZdjecia & { duzy?: string }) | null {
    const id = tekst(t.id, 20);
    const miniatura = https(t.webformatURL);
    const zrodloUrl = https(t.pageURL);
    if (!/^\d+$/.test(id) || !miniatura || !zrodloUrl) return null;
    const user = tekst(t.user, 120);
    const userId = tekst(t.user_id, 20);
    return {
      id,
      miniatura,
      szerokosc: liczba(t.imageWidth),
      wysokosc: liczba(t.imageHeight),
      autor: user || 'Pixabay',
      ...(user && /^\d+$/.test(userId) ? { autorUrl: `https://pixabay.com/users/${encodeURIComponent(user)}-${userId}/` } : {}),
      licencja: 'pixabay',
      licencjaUrl: LICENCJA_URL,
      zrodloUrl,
      duzy: https(t.largeImageURL),
    };
  }

  async szukaj(q: string, strona: number, naStrone: number): Promise<WynikWyszukiwania> {
    const r = await pobierzJson<{ totalHits?: unknown; hits?: Trafienie[] }>(
      this.f,
      this.adres({ q: q.slice(0, 100), image_type: 'photo', safesearch: 'true', per_page: String(naStrone), page: String(strona), lang: 'pl' }),
    );
    const wyniki = (Array.isArray(r.hits) ? r.hits : []).map((t) => this.mapuj(t)).filter((w): w is WynikZdjecia & { duzy?: string } => !!w);
    return { wyniki: wyniki.map(({ duzy: _d, ...w }) => w), razem: liczba(r.totalHits) };
  }

  async pobierz(id: string): Promise<ZdjecieDoPobrania> {
    if (!/^\d{1,20}$/.test(id)) throw new BladDostawcy(NIE_MA_ZDJECIA, 'zły identyfikator');
    const r = await pobierzJson<{ hits?: Trafienie[] }>(this.f, this.adres({ id }));
    const w = Array.isArray(r.hits) && r.hits[0] ? this.mapuj(r.hits[0]) : null;
    if (!w || !w.duzy) throw new BladDostawcy(NIE_MA_ZDJECIA, 'brak largeImageURL');
    const { id: _i, miniatura: _m, duzy, ...meta } = w;
    return { url: duzy, meta };
  }
}
