import { Logger } from '@nestjs/common';
import { rozpoznajTyp } from '../zasoby-obraz.js';
import {
  BLAD_BIBLIOTEKI,
  BladDostawcy,
  DOSTAWCY_ZDJEC,
  pobierzPlik,
  type DostawcaZdjec,
  type NazwaDostawcy,
  type WynikWyszukiwania,
  type ZdjecieDoPobrania,
} from './dostawca.js';

/** Wyniki wyszukiwania trzymamy 24 h (zasada Pixabay; Openverse ma niski limit anonimowy). */
export const CZAS_CACHE_MS = 24 * 60 * 60 * 1000;
export const MAKS_WPISOW_CACHE = 500;
/** Miniatury z proxy: łącznie w pamięci najwyżej tyle bajtów, pojedyncza ≤ 2 MB. */
export const MAKS_BAJTOW_MINIATUR = 40 * 1024 * 1024;
export const MAKS_BAJTOW_MINIATURY = 2 * 1024 * 1024;
export const NA_STRONE = 24;
export const MAKS_STRONA = 20;

/**
 * Limity zapytań do dostawców po naszej stronie (cała platforma, jedna replika API). Pixabay: ok. 100/min
 * (dokumentacja), Pexels: 200/h (dokumentacja), Openverse anonimowo – niski, ostrożnie (do sprawdzenia przy wdrożeniu).
 */
export const LIMITY_DOSTAWCOW: Record<NazwaDostawcy, { limit: number; oknoMs: number }> = {
  pixabay: { limit: 90, oknoMs: 60_000 },
  openverse: { limit: 20, oknoMs: 60_000 },
  pexels: { limit: 180, oknoMs: 60 * 60_000 },
};

class Okno {
  private znaczniki: number[] = [];
  constructor(
    private readonly limit: number,
    private readonly oknoMs: number,
  ) {}
  wez(teraz: number): boolean {
    this.znaczniki = this.znaczniki.filter((t) => t > teraz - this.oknoMs);
    if (this.znaczniki.length >= this.limit) return false;
    this.znaczniki.push(teraz);
    return true;
  }
}

/** Pamięć podręczna z terminem i limitem wpisów (najstarszy wypada pierwszy). */
export class Pamiec<T> {
  private readonly mapa = new Map<string, { do: number; wartosc: T; rozmiar: number }>();
  private suma = 0;
  constructor(
    private readonly maksWpisow: number,
    private readonly czasMs: number,
    private readonly maksRozmiar = Infinity,
  ) {}
  wez(klucz: string, teraz = Date.now()): T | undefined {
    const w = this.mapa.get(klucz);
    if (!w) return undefined;
    if (w.do <= teraz) {
      this.usun(klucz);
      return undefined;
    }
    return w.wartosc;
  }
  ustaw(klucz: string, wartosc: T, rozmiar = 0, teraz = Date.now()): void {
    this.usun(klucz);
    this.mapa.set(klucz, { do: teraz + this.czasMs, wartosc, rozmiar });
    this.suma += rozmiar;
    while (this.mapa.size > this.maksWpisow || this.suma > this.maksRozmiar) {
      const najstarszy = this.mapa.keys().next().value;
      if (najstarszy === undefined) break;
      this.usun(najstarszy);
    }
  }
  get rozmiar(): number {
    return this.mapa.size;
  }
  private usun(klucz: string): void {
    const w = this.mapa.get(klucz);
    if (w) {
      this.suma -= w.rozmiar;
      this.mapa.delete(klucz);
    }
  }
}

/**
 * Biblioteki zdjęć kreatora: wybór włączonych dostawców (konfiguracja admina ∩ dostawcy z kluczem), wyszukiwanie
 * z cache 24 h, miniatury przez proxy (cache w pamięci), pobranie oryginału do importu. Bez Nesta i bez bazy –
 * dostawcy wstrzykiwani (testy podstawiają atrapy fetch).
 */
export class BibliotekaZdjec {
  private readonly logger = new Logger('BibliotekaZdjec');
  private readonly wyniki = new Pamiec<WynikWyszukiwania>(MAKS_WPISOW_CACHE, CZAS_CACHE_MS);
  private readonly miniatury = new Pamiec<{ dane: Buffer; typ: string }>(2000, CZAS_CACHE_MS, MAKS_BAJTOW_MINIATUR);
  private readonly okna: Record<NazwaDostawcy, Okno>;
  private readonly dostawcy: Map<NazwaDostawcy, DostawcaZdjec>;

  constructor(dostawcy: DostawcaZdjec[]) {
    this.dostawcy = new Map(dostawcy.map((d) => [d.nazwa, d]));
    this.okna = Object.fromEntries(DOSTAWCY_ZDJEC.map((n) => [n, new Okno(LIMITY_DOSTAWCOW[n].limit, LIMITY_DOSTAWCOW[n].oknoMs)])) as Record<NazwaDostawcy, Okno>;
  }

  /** Dostawcy włączeni: w kolejności z konfiguracji, tylko ci z kluczem. */
  wlaczeni(zKonfiguracji: readonly NazwaDostawcy[]): DostawcaZdjec[] {
    return zKonfiguracji.map((n) => this.dostawcy.get(n)).filter((d): d is DostawcaZdjec => !!d && d.wlaczony());
  }

  dostawca(nazwa: string, zKonfiguracji: readonly NazwaDostawcy[]): DostawcaZdjec {
    const d = this.wlaczeni(zKonfiguracji).find((x) => x.nazwa === nazwa);
    if (!d) throw new BladDostawcy('Ta biblioteka zdjęć nie jest teraz dostępna.', `dostawca ${nazwa} wyłączony`);
    return d;
  }

  private limit(d: DostawcaZdjec): void {
    if (!this.okna[d.nazwa].wez(Date.now())) throw new BladDostawcy('Biblioteka zdjęć ma teraz za dużo zapytań – spróbuj za minutę.', 'limit po naszej stronie');
  }

  async szukaj(d: DostawcaZdjec, q: string, strona: number): Promise<WynikWyszukiwania> {
    const fraza = q.replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 100);
    const klucz = `${d.nazwa}|${strona}|${fraza}`;
    const z = this.wyniki.wez(klucz);
    if (z) return z;
    this.limit(d);
    const w = await this.zLogiem(d, () => d.szukaj(fraza, strona, NA_STRONE));
    this.wyniki.ustaw(klucz, w);
    return w;
  }

  /** Miniatura przez proxy: tylko host dostawcy, ≤ 2 MB, treść musi być obrazem rastrowym (nie HTML/SVG). */
  async miniatura(d: DostawcaZdjec, url: string): Promise<{ dane: Buffer; typ: string }> {
    const z = this.miniatury.wez(url);
    if (z) return z;
    const p = await this.zLogiem(d, () => pobierzPlik(d.f, url, d.hosty, MAKS_BAJTOW_MINIATURY, 10_000));
    let typ: string;
    try {
      typ = `image/${rozpoznajTyp(p.dane)}`;
    } catch {
      throw new BladDostawcy(BLAD_BIBLIOTEKI, 'miniatura nie jest obrazem');
    }
    const wynik = { dane: p.dane, typ };
    this.miniatury.ustaw(url, wynik, p.dane.length);
    return wynik;
  }

  /** Oryginał do importu: dane zdjęcia u dostawcy + plik (tylko z hostów dostawcy, limit rozmiaru i czasu). */
  async pobierzOryginal(d: DostawcaZdjec, id: string, maksBajtow: number): Promise<{ dane: Buffer; meta: ZdjecieDoPobrania['meta'] }> {
    this.limit(d);
    const z = await this.zLogiem(d, () => d.pobierz(id));
    const p = await this.zLogiem(d, () => pobierzPlik(d.f, z.url, d.hosty, maksBajtow, 30_000));
    return { dane: p.dane, meta: z.meta };
  }

  private async zLogiem<T>(d: DostawcaZdjec, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof BladDostawcy) {
        this.logger.warn(`Biblioteka ${d.nazwa}: ${e.szczegoly || e.message}`);
        throw e;
      }
      this.logger.warn(`Biblioteka ${d.nazwa}: ${e instanceof Error ? e.message : String(e)}`);
      throw new BladDostawcy(BLAD_BIBLIOTEKI);
    }
  }
}
