import { MATERIALY_KV } from '@verris/kreator/klient';

/**
 * Paczka 131 – mapa tras plików Kreatora marki (app/api/kreator-marki/[...sciezka]) na ścieżki API. Osobny moduł,
 * bo plik trasy Next może eksportować tylko GET/POST/… (i testy sprawdzają mapę bez uruchamiania trasy).
 */

/** Najwyższy limit wgrania z konfiguracji modułu (ZAKRESY_MARKI.maksRozmiarWgraniaMb) + zapas na pola multipart. Dokładny limit konta sprawdza API. */
export const MAKS_CIALA_WGRANIA = 25 * 1048576 + 64 * 1024;

const ID = '[A-Za-z0-9_-]{1,64}';
const MATERIAL = `(?:${MATERIALY_KV.join('|')})`;

/**
 * Dozwolone ścieżki GET (względem /api/kreator-marki/) → ścieżka w API. Wszystko inne = 404, więc trasa nie jest
 * ogólnym proxy do API. `zapytanie` – parametry przepuszczane dalej (reszta odrzucana).
 */
export interface TrasaGet {
  wzor: RegExp;
  api: (m: RegExpMatchArray) => string;
  zapytanie?: string[];
  publiczna?: boolean;
  pobranie?: boolean;
  typ: 'json' | 'plik';
}

const TRASY_GET: TrasaGet[] = [
  { wzor: new RegExp(`^fonty/([a-z0-9-]{1,80}\\.woff2)$`), api: (m) => `/fonts/kreator/${m[1]}`, publiczna: true, typ: 'plik' },
  { wzor: /^napis$/, api: () => '/kreator-marki/napis', zapytanie: ['font', 'waga', 'tekst', 'rozstrzelenie'], typ: 'json' },
  { wzor: new RegExp(`^marki/(${ID})/logo\\.svg$`), api: (m) => `/kreator-marki/marki/${m[1]}/logo.svg`, zapytanie: ['uklad', 'wariant'], typ: 'plik' },
  { wzor: new RegExp(`^marki/(${ID})/material/(${MATERIAL})\\.(svg|png)$`), api: (m) => `/kreator-marki/marki/${m[1]}/material/${m[2]}.${m[3]}`, typ: 'plik' },
  { wzor: new RegExp(`^marki/(${ID})/pliki/([a-z0-9][a-z0-9._-]{0,80})$`), api: (m) => `/kreator-marki/marki/${m[1]}/pliki/${m[2]}`, pobranie: true, typ: 'plik' },
  { wzor: new RegExp(`^marki/(${ID})/eksport\\.zip$`), api: (m) => `/kreator-marki/marki/${m[1]}/eksport.zip`, pobranie: true, typ: 'plik' },
];

/** Dopasowanie ścieżki z trasy panelu do ścieżki API (null = nie przepuszczamy). Eksport do testów. */
export function celGet(segmenty: string[], query: URLSearchParams): { url: string; trasa: TrasaGet } | null {
  const sciezka = segmenty.join('/');
  for (const t of TRASY_GET) {
    const m = sciezka.match(t.wzor);
    if (!m) continue;
    const q = new URLSearchParams();
    for (const k of t.zapytanie ?? []) {
      const v = query.get(k);
      if (v !== null && v.length <= 200) q.set(k, v);
    }
    const qs = q.toString();
    return { url: `${t.api(m)}${qs ? `?${qs}` : ''}`, trasa: t };
  }
  return null;
}

