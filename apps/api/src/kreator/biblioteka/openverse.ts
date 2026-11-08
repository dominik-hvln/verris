import { BladDostawcy, NIE_MA_ZDJECIA, hostDozwolony, https, liczba, pobierzJson, tekst, type DostawcaZdjec, type Fetch, type WynikWyszukiwania, type WynikZdjecia, type ZdjecieDoPobrania } from './dostawca.js';

/**
 * Openverse – https://api.openverse.org/v1/ (do sprawdzenia z dokumentacją przy wdrożeniu). Bez klucza (anonimowy
 * limit zapytań jest niski – cache i limit po naszej stronie). Tylko CC0 i domena publiczna (`license=cc0,pdm`) –
 * bez obowiązku podpisu autora.
 * GET /v1/images/?q=…&license=cc0,pdm&page=…&page_size=…  → results[], result_count
 * GET /v1/images/<id>/                                     → jeden wynik
 * Pola: id (uuid), url (oryginał u źródła), thumbnail (miniatura w API Openverse), width, height, creator,
 * creator_url, license, license_url, foreign_landing_url.
 *
 * Openverse agreguje wiele serwisów – oryginał leży u źródła. Import tylko ze źródeł z listy niżej (znane serwisy
 * z plikami https); wyniki z innych hostów nie trafiają do panelu, żeby klient nie wybrał zdjęcia nie do pobrania.
 */
const API = 'https://api.openverse.org/v1/images/';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const HOSTY_ORYGINALOW_OPENVERSE = [
  'live.staticflickr.com',
  '*.staticflickr.com',
  'upload.wikimedia.org',
  'images.rawpixel.com',
  'www.nasa.gov',
  'images-assets.nasa.gov',
  'collections.si.edu',
  'ids.si.edu',
  'images.metmuseum.org',
] as const;

interface Rekord {
  id?: unknown;
  url?: unknown;
  thumbnail?: unknown;
  width?: unknown;
  height?: unknown;
  creator?: unknown;
  creator_url?: unknown;
  license?: unknown;
  license_url?: unknown;
  foreign_landing_url?: unknown;
}

export class DostawcaOpenverse implements DostawcaZdjec {
  readonly nazwa = 'openverse' as const;
  readonly etykieta = 'Openverse';
  readonly hosty = ['api.openverse.org', ...HOSTY_ORYGINALOW_OPENVERSE] as const;

  constructor(readonly f: Fetch = fetch) {}

  wlaczony(): boolean {
    return true;
  }

  private mapuj(r: Rekord): (WynikZdjecia & { oryginal: string }) | null {
    const id = tekst(r.id, 40);
    const oryginal = https(r.url);
    const miniatura = https(r.thumbnail);
    const licencja = tekst(r.license, 20).toLowerCase();
    if (!UUID.test(id) || !oryginal || !miniatura || !(licencja === 'cc0' || licencja === 'pdm')) return null;
    if (!hostDozwolony(oryginal, HOSTY_ORYGINALOW_OPENVERSE) || !hostDozwolony(miniatura, this.hosty)) return null;
    const autorUrl = https(r.creator_url);
    const licencjaUrl = https(r.license_url);
    return {
      id,
      miniatura,
      szerokosc: liczba(r.width),
      wysokosc: liczba(r.height),
      autor: tekst(r.creator, 120) || 'Autor nieznany',
      ...(autorUrl ? { autorUrl } : {}),
      licencja,
      ...(licencjaUrl ? { licencjaUrl } : {}),
      zrodloUrl: https(r.foreign_landing_url) ?? `https://openverse.org/image/${id}`,
      oryginal,
    };
  }

  async szukaj(q: string, strona: number, naStrone: number): Promise<WynikWyszukiwania> {
    const p = new URLSearchParams({ q: q.slice(0, 100), license: 'cc0,pdm', page: String(strona), page_size: String(naStrone) });
    const r = await pobierzJson<{ result_count?: unknown; results?: Rekord[] }>(this.f, `${API}?${p.toString()}`);
    const wyniki = (Array.isArray(r.results) ? r.results : []).map((x) => this.mapuj(x)).filter((w): w is WynikZdjecia & { oryginal: string } => !!w);
    return { wyniki: wyniki.map(({ oryginal: _o, ...w }) => w), razem: liczba(r.result_count) };
  }

  async pobierz(id: string): Promise<ZdjecieDoPobrania> {
    if (!UUID.test(id)) throw new BladDostawcy(NIE_MA_ZDJECIA, 'zły identyfikator');
    const w = this.mapuj(await pobierzJson<Rekord>(this.f, `${API}${id.toLowerCase()}/`));
    if (!w) throw new BladDostawcy('Tego zdjęcia nie da się zaimportować – wybierz inne.', 'licencja albo host spoza listy');
    const { id: _i, miniatura: _m, oryginal, ...meta } = w;
    return { url: oryginal, meta };
  }
}
