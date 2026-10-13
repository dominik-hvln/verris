import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * FONT-1 — Proxy/CDN fontów (RODO-safe self-hosting Google Fonts).
 *
 * Odwiedzający stronę klienta NIGDY nie łączy się z Google — całą komunikację
 * z fonts.googleapis.com / fonts.gstatic.com wykonuje serwer Verris, a klientowi
 * serwujemy CSS z przepisanymi URL-ami i same pliki WOFF2 z naszej domeny.
 * To standardowy, zgodny z RODO wzorzec (jak Bunny Fonts), bo do Google trafia
 * tylko IP serwera Verris, nie odwiedzającego.
 *
 * Warstwa cache: CSS i pliki fontów trzymamy w pamięci (bounded + TTL), więc
 * kolejne odsłony są serwowane lokalnie bez odpytywania Google.
 */
@Injectable()
export class FontsProxyService {
  private readonly logger = new Logger(FontsProxyService.name);

  private static readonly CSS_TTL_MS = 24 * 60 * 60 * 1000; // 24h
  private static readonly FILE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30d
  private static readonly MAX_FILES = 500;
  // Audyt bezpieczeństwa 13.10: cssCache był kluczowany querystringiem anonimowego klienta bez żadnego limitu —
  // każdy unikalny zestaw rodzin to nowy wpis w pamięci API na 24 h. Limit liczby wpisów i bajtów jak przy plikach.
  static readonly MAX_CSS_ENTRIES = 300;
  static readonly MAX_CSS_BYTES = 8 * 1024 * 1024;
  private static readonly MAX_QUERY = 1024;
  private static readonly MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MB / plik
  // Realistyczny UA — Google zwraca WOFF2 tylko nowoczesnym przeglądarkom.
  private static readonly UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

  private readonly cssCache = new Map<string, { body: string; at: number }>();
  private readonly fileCache = new Map<string, { buf: Buffer; type: string; at: number }>();

  constructor(private readonly config: ConfigService) {}

  /** Publiczna baza (do przepisywania URL-i plików). */
  private base(): string {
    return (
      this.config.get<string>('PUBLIC_API_URL') ??
      this.config.get<string>('API_BASE_URL') ??
      'https://api.verris.pl'
    );
  }

  /**
   * Zwraca CSS Google Fonts z URL-ami plików przepisanymi na proxy Verris.
   * `query` to surowy querystring (np. „family=Inter:wght@400;700&display=swap").
   */
  async css(query: string): Promise<string> {
    const q = this.sanitizeQuery(query);
    const cached = this.cssCache.get(q);
    if (cached && Date.now() - cached.at < FontsProxyService.CSS_TTL_MS) {
      return cached.body;
    }

    const url = `https://fonts.googleapis.com/css2?${q}`;
    let raw: string;
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': FontsProxyService.UA, Accept: 'text/css,*/*;q=0.1' },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`Google Fonts CSS HTTP ${res.status}`);
      raw = await res.text();
    } catch (err) {
      this.logger.warn(`Fonts CSS fetch failed (${q}): ${(err as Error).message}`);
      throw new BadRequestException('Nie udało się pobrać arkusza fontów.');
    }

    // Przepisz każdy https://fonts.gstatic.com/... na nasz endpoint pliku.
    const rewritten = raw.replace(/https:\/\/fonts\.gstatic\.com\/[^)'" ]+/g, (m) => {
      return `${this.base()}/fonts/file?u=${encodeURIComponent(m)}`;
    });

    this.rememberCss(q, rewritten);
    return rewritten;
  }

  /** Pobiera (i cache'uje) plik fontu z gstatic. `u` musi być URL-em gstatic. */
  async file(u: string): Promise<{ buf: Buffer; type: string }> {
    if (!/^https:\/\/fonts\.gstatic\.com\//.test(u)) {
      throw new BadRequestException('Niedozwolone źródło fontu.');
    }
    const cached = this.fileCache.get(u);
    if (cached && Date.now() - cached.at < FontsProxyService.FILE_TTL_MS) {
      return { buf: cached.buf, type: cached.type };
    }

    let buf: Buffer;
    let type: string;
    try {
      const res = await fetch(u, {
        headers: { 'User-Agent': FontsProxyService.UA },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`gstatic HTTP ${res.status}`);
      const ab = await res.arrayBuffer();
      if (ab.byteLength > FontsProxyService.MAX_FILE_BYTES) {
        throw new Error('Plik fontu przekracza limit rozmiaru.');
      }
      buf = Buffer.from(ab);
      type = res.headers.get('content-type') || this.guessType(u);
    } catch (err) {
      this.logger.warn(`Font file fetch failed: ${(err as Error).message}`);
      throw new BadRequestException('Nie udało się pobrać pliku fontu.');
    }

    this.rememberFile(u, { buf, type, at: Date.now() });
    return { buf, type };
  }

  // -------------------------------------------------------------------------

  /** Liczba wpisów i łączny rozmiar CSS w pamięci (do testów i diagnostyki). */
  cssCacheStats(): { entries: number; bytes: number } {
    let bytes = 0;
    for (const v of this.cssCache.values()) bytes += v.body.length;
    return { entries: this.cssCache.size, bytes };
  }

  private rememberCss(key: string, body: string): void {
    const teraz = Date.now();
    this.cssCache.delete(key);
    // Najpierw wygasłe, potem najstarsze (Map trzyma kolejność wstawiania) — aż zmieści się nowy wpis.
    for (const [k, v] of this.cssCache) if (teraz - v.at >= FontsProxyService.CSS_TTL_MS) this.cssCache.delete(k);
    let bytes = body.length;
    for (const v of this.cssCache.values()) bytes += v.body.length;
    for (const [k, v] of this.cssCache) {
      if (this.cssCache.size < FontsProxyService.MAX_CSS_ENTRIES && bytes <= FontsProxyService.MAX_CSS_BYTES) break;
      this.cssCache.delete(k);
      bytes -= v.body.length;
    }
    if (body.length <= FontsProxyService.MAX_CSS_BYTES) this.cssCache.set(key, { body, at: teraz });
  }

  private rememberFile(key: string, val: { buf: Buffer; type: string; at: number }): void {
    // Prosty bound: gdy przekroczymy limit, usuwamy najstarszy wpis.
    if (this.fileCache.size >= FontsProxyService.MAX_FILES) {
      let oldestKey: string | null = null;
      let oldestAt = Infinity;
      for (const [k, v] of this.fileCache.entries()) {
        if (v.at < oldestAt) {
          oldestAt = v.at;
          oldestKey = k;
        }
      }
      if (oldestKey) this.fileCache.delete(oldestKey);
    }
    this.fileCache.set(key, val);
  }

  private guessType(u: string): string {
    if (u.endsWith('.woff2')) return 'font/woff2';
    if (u.endsWith('.woff')) return 'font/woff';
    if (u.endsWith('.ttf')) return 'font/ttf';
    return 'application/octet-stream';
  }

  /**
   * Sanityzacja querystringa: dopuszczamy tylko znaki występujące w zapytaniach
   * Google Fonts (family/wght/ital/display/subset). Blokuje próby nadużycia
   * proxy do dowolnych URL-i.
   */
  private sanitizeQuery(query: string): string {
    const q = (query ?? '').trim().replace(/^\?/, '');
    if (!q || q.length > FontsProxyService.MAX_QUERY) throw new BadRequestException('Nieprawidłowe zapytanie fontów.');
    if (!/^[A-Za-z0-9:;@,.+_%&=~ -]+$/.test(q)) {
      throw new BadRequestException('Nieprawidłowe znaki w zapytaniu fontów.');
    }
    if (!/family=/.test(q)) throw new BadRequestException('Brak parametru family.');
    return q;
  }
}
