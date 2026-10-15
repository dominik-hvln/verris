import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccountStatus } from '@verris/database';
import http from 'http';
import https from 'https';
import { pipeline } from 'stream';
import type { Request, Response } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CIASTKO_DOSTEPU,
  SCIEZKA_WEJSCIA,
  kluczDostepuPodgladu,
  rowneStaloczasowo,
  sprawdzTokenPodgladu,
  terminTygodniowy,
  utworzTokenPodgladu,
} from './podglad-token.js';
import { NAGLOWKI_DOZWOLONE, czyTekstowy, przepiszAdresy, przepiszCookie, wstawPasekPodgladu } from './podglad-przepisz.js';

/** Treść tekstowa większa niż to idzie bez podmiany adresów (strumieniem) — ochrona pamięci API (noc 15.10: 8 → 2 MB). */
const MAKS_PRZEPISANIE = 2 * 1024 * 1024;
/** Noc 15.10 — proxy działa w procesie API: limit równoległych żądań i całkowity czas jednego żądania. */
const MAKS_ROWNOLEGLYCH = 24;
const MAKS_CZAS_MS = 30_000;

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
  /** Czas jednego żądania (podmieniany wyłącznie w testach). */
  maksCzasMs = MAKS_CZAS_MS;
  private aktywne = 0;

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
    const wygasa = terminTygodniowy();
    const etykieta = utworzTokenPodgladu(this.klucz(), account.id, wygasa);
    const k = kluczDostepuPodgladu(this.klucz(), etykieta);
    return { url: `https://${etykieta}.${domena}${SCIEZKA_WEJSCIA}?k=${k}`, wygasa: wygasa.toISOString(), domena: account.domain };
  }

  /** Etykieta i konto z nazwy hosta żądania (`<etykieta>.<domena podglądu>`) albo null. */
  private zHosta(host: string | undefined): { accountId: string; wygasa: Date; etykieta: string } | null {
    const domena = this.domena();
    if (!domena || !host) return null;
    const h = host.toLowerCase().replace(/:\d+$/, '');
    if (!h.endsWith(`.${domena}`)) return null;
    const etykieta = h.slice(0, -(domena.length + 1));
    if (etykieta.includes('.')) return null;
    const t = sprawdzTokenPodgladu(this.klucz(), etykieta);
    return t ? { ...t, etykieta } : null;
  }

  /** Caddy on-demand TLS (`ask`): certyfikat tylko dla ważnej etykiety aktywnego konta (limity Let's Encrypt). */
  async czyWydacCertyfikat(host: string | undefined): Promise<boolean> {
    const t = this.zHosta(host);
    if (!t) return false;
    const konto = await this.prisma.account.findUnique({ where: { id: t.accountId }, select: { status: true } });
    return konto?.status === AccountStatus.ACTIVE;
  }

  /** Ciasteczka żądania bez naszego ciasteczka dostępu (do węzła klienta nie trafia) i wynik sprawdzenia dostępu. */
  private dostep(cookie: string | undefined, k: string): { ok: boolean; reszta: string } {
    let ok = false;
    const reszta: string[] = [];
    for (const kawalek of (cookie ?? '').split(';')) {
      const c = kawalek.trim();
      if (!c) continue;
      const i = c.indexOf('=');
      if (i > 0 && c.slice(0, i) === CIASTKO_DOSTEPU) {
        if (rowneStaloczasowo(c.slice(i + 1), k)) ok = true;
        continue;
      }
      reszta.push(c);
    }
    return { ok, reszta: reszta.join('; ') };
  }

  async proxy(req: Request, res: Response, sciezka: string): Promise<void> {
    const host = req.headers.host;
    const t = this.zHosta(host);
    if (!t) return this.strona(res, 404, 'Ten adres podglądu jest nieprawidłowy albo wygasł. Wygeneruj nowy w panelu.');
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return this.strona(res, 405, 'Podgląd przed zmianą DNS służy do oglądania strony — logowanie i formularze zadziałają po przełączeniu domeny.');
    }
    const podglad = host!.toLowerCase().replace(/:\d+$/, '');
    const k = kluczDostepuPodgladu(this.klucz(), t.etykieta);

    // Wejście z linku z panelu: klucz z adresu → ciasteczko hosta podglądu (bez Domain), powrót na stronę główną.
    const adres = new URL(sciezka, 'http://podglad.invalid');
    if (adres.pathname === SCIEZKA_WEJSCIA) {
      if (!rowneStaloczasowo(adres.searchParams.get('k'), k)) {
        return this.strona(res, 403, 'Link podglądu jest niepełny albo nieaktualny. Otwórz podgląd jeszcze raz z panelu.');
      }
      const sek = Math.max(0, Math.floor((t.wygasa.getTime() - Date.now()) / 1000));
      res.setHeader('set-cookie', `${CIASTKO_DOSTEPU}=${k}; Path=/; Max-Age=${sek}; Secure; HttpOnly; SameSite=Lax`);
      res.setHeader('location', '/');
      res.setHeader('cache-control', 'no-store');
      res.setHeader('x-robots-tag', 'noindex, nofollow');
      res.status(302).end();
      return;
    }
    const { ok, reszta } = this.dostep(req.headers.cookie, k);
    if (!ok) {
      return this.strona(res, 403, 'Ten podgląd otwiera się z linku w panelu Verris (karta usługi albo przeprowadzka strony).');
    }

    if (this.aktywne >= MAKS_ROWNOLEGLYCH) {
      res.setHeader('retry-after', '5');
      return this.strona(res, 503, 'Zbyt wiele podglądów naraz. Odśwież stronę za kilka sekund.');
    }
    this.aktywne += 1;
    let zwolnione = false;
    const zwolnij = () => {
      if (zwolnione) return;
      zwolnione = true;
      this.aktywne -= 1;
    };
    res.once('close', zwolnij);
    res.once('finish', zwolnij);
    try {
      await this.przekaz(req, res, sciezka, t.accountId, podglad, reszta);
    } finally {
      if (res.writableEnded || res.destroyed) zwolnij();
    }
  }

  private async przekaz(req: Request, res: Response, sciezka: string, accountId: string, podglad: string, ciastka: string): Promise<void> {
    const konto = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { domain: true, status: true, server: { select: { ipAddress: true } } },
    });
    if (!konto || konto.status !== AccountStatus.ACTIVE || !konto.server?.ipAddress) {
      return this.strona(res, 404, 'Konto tej strony nie jest aktywne.');
    }
    const naglowki: Record<string, string> = {
      host: konto.domain,
      'accept-encoding': 'identity',
      'user-agent': String(req.headers['user-agent'] ?? 'Verris-Podglad'),
      accept: String(req.headers.accept ?? '*/*'),
      'x-forwarded-proto': 'https',
    };
    if (req.headers['accept-language']) naglowki['accept-language'] = String(req.headers['accept-language']);
    if (ciastka) naglowki.cookie = ciastka;

    // Całkowity czas żądania (timeout gniazda w http.request to tylko bezczynność — węzeł wysyłający po bajcie trzymałby
    // proces API bez końca).
    let wezelReq: http.ClientRequest | null = null;
    const czasomierz = setTimeout(() => {
      wezelReq?.destroy(new Error('przekroczony czas'));
      if (res.headersSent) res.destroy();
      else this.strona(res, 504, 'Strona odpowiada zbyt długo. Spróbuj za chwilę.');
    }, this.maksCzasMs);
    res.once('close', () => clearTimeout(czasomierz));

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
        wezelReq = r;
        r.on('timeout', () => r.destroy(new Error('timeout')));
        r.on('error', blad);
        r.end();
      });

    let odp: http.IncomingMessage;
    try {
      odp = await zapytaj(true).catch(() => zapytaj(false));
    } catch (e) {
      clearTimeout(czasomierz);
      if (res.headersSent || res.writableEnded) return;
      this.logger.warn(`Podgląd ${konto.domain}: brak odpowiedzi węzła (${(e as Error).message})`);
      return this.strona(res, 502, 'Serwer tej strony nie odpowiada. Spróbuj za chwilę.');
    }
    if (res.headersSent || res.writableEnded) {
      odp.destroy();
      return;
    }

    // Przekierowanie: tylko w obrębie podglądu (domena klienta → adres podglądu, ścieżki względne). Inny host (np. adres
    // serwera, panel) nie wychodzi do przeglądarki — white label.
    let location: string | null = null;
    if (odp.headers.location) {
      const l = przepiszAdresy(String(odp.headers.location), konto.domain, podglad);
      let cel: URL | null;
      try {
        cel = new URL(l, `https://${podglad}/`);
      } catch {
        cel = null;
      }
      if (!cel || cel.host !== podglad) {
        odp.resume();
        clearTimeout(czasomierz);
        return this.strona(res, 502, 'Strona przekierowuje poza podgląd. Sprawdzisz to przekierowanie po zmianie DNS.');
      }
      location = cel.pathname + cel.search + cel.hash;
    }

    res.status(odp.statusCode ?? 502);
    for (const [n, v] of Object.entries(odp.headers)) {
      if (v === undefined || !NAGLOWKI_DOZWOLONE.has(n)) continue;
      res.setHeader(n, v);
    }
    if (location) res.setHeader('location', location);
    const ciastkaWezla = odp.headers['set-cookie'];
    if (ciastkaWezla) res.setHeader('set-cookie', ciastkaWezla.map(przepiszCookie));
    res.setHeader('x-robots-tag', 'noindex, nofollow');
    res.setHeader('cache-control', 'private, no-store');
    res.setHeader('x-frame-options', 'SAMEORIGIN');
    res.setHeader('content-security-policy', "frame-ancestors 'self'");

    const strumien = (): void => {
      pipeline(odp, res, (err) => {
        clearTimeout(czasomierz);
        if (err) res.destroy(err);
      });
    };

    if (req.method === 'HEAD') {
      odp.resume();
      clearTimeout(czasomierz);
      res.end();
      return;
    }
    const kodowanie = String(odp.headers['content-encoding'] ?? 'identity').toLowerCase();
    const rozmiar = Number(odp.headers['content-length'] ?? 0);
    if (kodowanie !== 'identity') {
      // Węzeł zignorował Accept-Encoding: identity — przekazujemy bez podmiany adresów, z nagłówkiem kodowania.
      res.setHeader('content-encoding', kodowanie);
      return strumien();
    }
    if (!czyTekstowy(odp.headers['content-type']) || rozmiar > MAKS_PRZEPISANIE) return strumien();

    const kawalki: Buffer[] = [];
    let razem = 0;
    try {
      for await (const kaw of odp) {
        razem += (kaw as Buffer).length;
        if (razem > MAKS_PRZEPISANIE) {
          // Bez nagłówka długości było więcej niż limit — dalej bez podmiany, strumieniem.
          res.write(Buffer.concat(kawalki));
          res.write(kaw as Buffer);
          return strumien();
        }
        kawalki.push(kaw as Buffer);
      }
    } catch {
      clearTimeout(czasomierz);
      if (!res.writableEnded) res.destroy();
      return;
    }
    clearTimeout(czasomierz);
    // latin1 zachowuje bajty 1:1 (strony w windows-1250 itd.); podmieniane są tylko nazwy hostów w ASCII.
    let tresc = przepiszAdresy(Buffer.concat(kawalki).toString('latin1'), konto.domain, podglad);
    if (/^text\/html\b/i.test(String(odp.headers['content-type'] ?? ''))) tresc = wstawPasekPodgladu(tresc, konto.domain);
    res.end(Buffer.from(tresc, 'latin1'));
  }

  private strona(res: Response, status: number, tekst: string): void {
    if (res.headersSent) {
      res.destroy();
      return;
    }
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
