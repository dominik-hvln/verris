import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccountStatus } from '@verris/database';
import http from 'http';
import https from 'https';
import type { Request, Response } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';
import { sprawdzTokenPodgladu, utworzTokenPodgladu } from './podglad-token.js';
import { czyTekstowy, przepiszAdresy, przepiszCookie } from './podglad-przepisz.js';

/** Ile ważny jest adres podglądu (decyzja projektowa: tydzień — tyle zwykle trwa przeniesienie i test). */
export const PODGLAD_DNI = 7;
/** Treść tekstowa większa niż to idzie bez podmiany adresów (strumieniem) — ochrona pamięci API. */
const MAKS_PRZEPISANIE = 8 * 1024 * 1024;
const BEZ_PRZEKAZANIA = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade',
  'content-length', 'content-encoding', 'strict-transport-security', 'server', 'x-powered-by', 'alt-svc',
  'content-security-policy', 'content-security-policy-report-only', 'set-cookie', 'location',
]);

/**
 * 15.10 — tymczasowy adres podglądu strony przed zmianą DNS. White label: klient widzi `<token>.<PODGLAD_DOMENA>`,
 * nigdy adresu węzła. Ruch: przeglądarka → Caddy (wildcard, on-demand TLS z pytaniem do `tls-check`) → ten serwis →
 * węzeł konta po IP z nagłówkiem Host = domena klienta (jak przeglądarka po zmianie DNS). Adresy domeny w odpowiedzi
 * podmieniamy na adres podglądu.
 *
 * Zasady:
 * - tylko GET/HEAD (podgląd do oglądania, bez logowania i wysyłania formularzy na stronę w trakcie przenosin);
 * - domena podglądu musi być OSOBNĄ domeną (nie poddomeną verris.pl): treść klienta z jego skryptami działa pod nią,
 *   więc nie może dzielić ciasteczek z panelami (cookie scope);
 * - bez PODGLAD_DOMENA funkcja jest wyłączona (404, przycisk w panelu się nie pokazuje).
 */
@Injectable()
export class PodgladService {
  private readonly logger = new Logger(PodgladService.name);
  /** Porty węzła (podmieniane wyłącznie w testach). */
  porty = { https: 443, http: 80 };

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Domena podglądu albo null (wyłączone). Domena pod verris.pl jest odrzucana — patrz opis klasy. */
  domena(): string | null {
    const d = (process.env.PODGLAD_DOMENA ?? '').trim().toLowerCase().replace(/^\.+|\.+$/g, '');
    if (!d || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) return null;
    if (d === 'verris.pl' || d.endsWith('.verris.pl')) {
      this.logger.error('PODGLAD_DOMENA nie może być w domenie verris.pl (wspólne ciasteczka z panelami) — podgląd wyłączony.');
      return null;
    }
    return d;
  }

  private klucz(): string {
    return this.config.get<string>('appKmsKey')!;
  }

  /** Adres podglądu konta usługi klienta. */
  async adresDlaKlienta(subscriptionId: string, userId: string) {
    const sub = await this.prisma.subscription.findFirst({
      where: { id: subscriptionId, userId },
      select: { account: { select: { id: true, domain: true, status: true } } },
    });
    if (!sub?.account) throw new NotFoundException('Ta usługa nie ma konta hostingowego.');
    return this.adres(sub.account);
  }

  /** Adres podglądu dla zespołu (karta usługi, wynik testu strony po przeniesieniu). */
  async adresDlaZespolu(subscriptionId: string) {
    const sub = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      select: { account: { select: { id: true, domain: true, status: true } } },
    });
    if (!sub?.account) throw new NotFoundException('Ta usługa nie ma konta hostingowego.');
    return this.adres(sub.account);
  }

  private adres(account: { id: string; domain: string; status: AccountStatus }) {
    const domena = this.domena();
    if (!domena) throw new NotFoundException('Podgląd przed zmianą DNS nie jest włączony.');
    if (account.status !== AccountStatus.ACTIVE) throw new BadRequestException('Podgląd działa tylko dla aktywnego konta.');
    const wygasa = new Date(Date.now() + PODGLAD_DNI * 86400000);
    const token = utworzTokenPodgladu(this.klucz(), account.id, wygasa);
    return { url: `https://${token}.${domena}/`, wygasa: wygasa.toISOString(), domena: account.domain };
  }

  /** Token z nazwy hosta żądania (`<token>.<domena podglądu>`) albo null. */
  private zHosta(host: string | undefined): { accountId: string } | null {
    const domena = this.domena();
    if (!domena || !host) return null;
    const h = host.toLowerCase().replace(/:\d+$/, '');
    if (!h.endsWith(`.${domena}`)) return null;
    const etykieta = h.slice(0, -(domena.length + 1));
    if (etykieta.includes('.')) return null;
    return sprawdzTokenPodgladu(this.klucz(), etykieta);
  }

  /** Caddy on-demand TLS (`ask`): certyfikat tylko dla ważnego tokenu — bez tego każdy mógłby zużywać limity Let's Encrypt. */
  async czyWydacCertyfikat(host: string | undefined): Promise<boolean> {
    const t = this.zHosta(host);
    if (!t) return false;
    const konto = await this.prisma.account.findUnique({ where: { id: t.accountId }, select: { status: true } });
    return konto?.status === AccountStatus.ACTIVE;
  }

  async proxy(req: Request, res: Response, sciezka: string): Promise<void> {
    const host = req.headers.host;
    const t = this.zHosta(host);
    if (!t) return this.strona(res, 404, 'Ten adres podglądu jest nieprawidłowy albo wygasł. Wygeneruj nowy w panelu.');
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return this.strona(res, 405, 'Podgląd przed zmianą DNS służy do oglądania strony — logowanie i formularze zadziałają po przełączeniu domeny.');
    }
    const konto = await this.prisma.account.findUnique({
      where: { id: t.accountId },
      select: { domain: true, status: true, server: { select: { ipAddress: true } } },
    });
    if (!konto || konto.status !== AccountStatus.ACTIVE || !konto.server?.ipAddress) {
      return this.strona(res, 404, 'Konto tej strony nie jest aktywne.');
    }
    const podglad = host!.toLowerCase().replace(/:\d+$/, '');
    const naglowki: Record<string, string> = {
      host: konto.domain,
      'accept-encoding': 'identity',
      'user-agent': String(req.headers['user-agent'] ?? 'Verris-Podglad'),
      accept: String(req.headers.accept ?? '*/*'),
      'x-forwarded-proto': 'https',
    };
    if (req.headers['accept-language']) naglowki['accept-language'] = String(req.headers['accept-language']);
    if (req.headers.cookie) naglowki.cookie = String(req.headers.cookie);

    const zapytaj = (bezpieczne: boolean) =>
      new Promise<http.IncomingMessage>((ok, blad) => {
        const opcje = {
          host: konto.server!.ipAddress!,
          port: bezpieczne ? this.porty.https : this.porty.http,
          method: req.method,
          path: sciezka || '/',
          headers: naglowki,
          timeout: 20000,
          // Certyfikat domeny klienta zwykle jeszcze nie istnieje (DNS wskazuje stary hosting) — łączymy się z naszym
          // węzłem po IP z bazy, więc treść i tak pochodzi od nas; weryfikacja nazwy nie ma tu czego potwierdzić.
          ...(bezpieczne ? { servername: konto.domain, rejectUnauthorized: false } : {}),
        };
        const r = (bezpieczne ? https : http).request(opcje, ok);
        r.on('timeout', () => r.destroy(new Error('timeout')));
        r.on('error', blad);
        r.end();
      });

    let odp: http.IncomingMessage;
    try {
      odp = await zapytaj(true).catch(() => zapytaj(false));
    } catch (e) {
      this.logger.warn(`Podgląd ${konto.domain}: brak odpowiedzi węzła (${(e as Error).message})`);
      return this.strona(res, 502, 'Serwer tej strony nie odpowiada. Spróbuj za chwilę.');
    }

    res.status(odp.statusCode ?? 502);
    for (const [k, v] of Object.entries(odp.headers)) {
      if (v === undefined || BEZ_PRZEKAZANIA.has(k)) continue;
      res.setHeader(k, v);
    }
    const loc = odp.headers.location;
    if (loc) res.setHeader('location', przepiszAdresy(String(loc), konto.domain, podglad));
    const ciastka = odp.headers['set-cookie'];
    if (ciastka) res.setHeader('set-cookie', ciastka.map(przepiszCookie));
    res.setHeader('x-robots-tag', 'noindex, nofollow');
    res.setHeader('cache-control', 'private, no-store');
    res.removeHeader('x-frame-options');

    const rozmiar = Number(odp.headers['content-length'] ?? 0);
    if (req.method === 'HEAD') {
      odp.resume();
      res.end();
      return;
    }
    if (!czyTekstowy(odp.headers['content-type']) || rozmiar > MAKS_PRZEPISANIE) {
      odp.pipe(res);
      return;
    }
    const kawalki: Buffer[] = [];
    let razem = 0;
    for await (const k of odp) {
      razem += (k as Buffer).length;
      if (razem > MAKS_PRZEPISANIE) {
        // Bez nagłówka długości było więcej niż limit — dalej bez podmiany, strumieniem.
        res.write(Buffer.concat(kawalki));
        res.write(k as Buffer);
        odp.pipe(res);
        return;
      }
      kawalki.push(k as Buffer);
    }
    res.end(przepiszAdresy(Buffer.concat(kawalki).toString('utf8'), konto.domain, podglad));
  }

  private strona(res: Response, status: number, tekst: string): void {
    res.status(status);
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.setHeader('x-robots-tag', 'noindex, nofollow');
    res.setHeader('cache-control', 'no-store');
    res.end(
      `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Podgląd strony</title></head>` +
        `<body style="font-family:system-ui,sans-serif;background:#091410;color:#F4F4EE;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px"><main style="max-width:520px"><h1 style="font-size:24px">Podgląd strony</h1><p style="color:#B4C2BB;line-height:1.6">${tekst}</p></main></body></html>`,
    );
  }
}
