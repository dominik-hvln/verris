import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@verris/database';
import type { Readable } from 'node:stream';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { ObjectStorageService } from '../../storage/object-storage.service.js';
import { ObjectBuckets } from '../../storage/object-storage.types.js';
import { resolveSmtpIdentity } from '../../mail/mail-smtp.factory.js';
import { CONTROL_PLANE_MAIL_DOMAIN } from '../../control-plane-mail/control-plane-mail.constants.js';
import { krotkieIdZTematu, zgloszenieZNaglowkow } from '../../mail/watek-zgloszenia.js';
import { stronaListy } from '../../subscriptions/lista-uslug.js';
import { uprawnieniaOperatora } from '../../staff-roles/uprawnienia-operatora.js';
import { AdminCustomerActions } from '../../common/audit/audit.actions.js';
import { BLOKADA_RESETU_PO_ZMIANIE_EMAILA_H, zmianyEmailaPrzezObsluge } from '../../users/zmiana-emaila-przez-obsluge.js';
import { TAG_EMAIL_NIEZWERYFIKOWANY, TicketsService } from '../tickets.service.js';
import { BladImap, PolaczenieImap, polaczTls } from './imap.js';
import {
  dataOtrzymania,
  normalizujWzorzec,
  parsujMail,
  parsujNaglowki,
  powodAutomatu,
  powodSpamu,
  tematZgloszenia,
  zablokowany,
  type MailPrzychodzacy,
  type PominietyZalacznik,
} from './parser.js';

/**
 * F3.7 (OE-19, OE-20, D6) — poczta przychodząca do zgłoszeń z IMAP skrzynki zespołu (control-plane-mail, Dovecot).
 *
 * Co 2 minuty: nowe maile (bez słowa kluczowego `VerrisZgloszenia`, z ostatnich 30 dni) → nadawca dopasowany do konta
 * klienta po adresie → odpowiedź w wątku (nagłówki In-Reply-To/References z naszym Message-ID albo „[#xxxxxxxx]”
 * w temacie, tylko zgłoszenie tego klienta) albo nowe zgłoszenie. Obcy nadawca, nadawca, który nie jest właścicielem
 * zgłoszenia z wątku, i DMARC=fail → kolejka „Poczta bez klienta” (decyzja obsługi). Spam, automaty, blokady i za duże
 * maile — zapis bez zgłoszenia i bez odpowiedzi do nadawcy. Idempotencja: unikalny Message-ID w bazie (zapis w tej
 * samej transakcji co zgłoszenie) + słowo kluczowe IMAP po zapisie. Mail zostaje w skrzynce (BODY.PEEK — bez \Seen).
 *
 * Konfiguracja (env API, bez sekretów w kodzie): CONTROL_PLANE_MAIL_HOST (istniejący host skrzynek zespołu),
 * CONTROL_PLANE_MAIL_TICKETS_USER / CONTROL_PLANE_MAIL_TICKETS_PASSWORD (skrzynka, do której trafiają support@
 * i abuse@ — hasło IMAP z „Reset hasła” w Poczcie zespołu), opcjonalnie CONTROL_PLANE_MAIL_IMAP_PORT (993)
 * i CONTROL_PLANE_MAIL_TICKETS_CERT_SHA256 (przypięty odcisk certyfikatu samopodpisanego). Bez loginu i hasła
 * zadanie nic nie robi. Wzór: WHMCS Email Importing https://docs.whmcs.com/9-0/support/email-importing/.
 */
export const SLOWO_ZAIMPORTOWANY = 'VerrisZgloszenia';
export const OKNO_DNI = 30;
export const MAX_NA_PRZEBIEG = 50;
/** Mail większy (RFC822.SIZE) nie jest pobierany — tylko nagłówki do kolejki. */
export const MAX_ROZMIAR_MAILA = 15 * 1024 * 1024;
export const RETENCJA_DNI = 90;
/**
 * Najwyżej tyle nowych zgłoszeń z maili jednego konta na godzinę — dalsze idą do kolejki bez potwierdzenia do klienta.
 * Hamulec pętli (autoresponder bez nagłówków RFC 3834 i bez wątku: potwierdzenie → autoodpowiedź → nowe zgłoszenie →
 * potwierdzenie…) i zalewu skrzynki klienta potwierdzeniami po podszyciu pod jego adres. Przegląd F3.7.
 */
export const LIMIT_NOWYCH_NA_GODZINE = 5;
/** Wyniki, które czekają na decyzję obsługi. */
export const W_KOLEJCE = ['BEZ_KLIENTA', 'SPAM'] as const;

/**
 * Audyt Fali 3 — operator z tokenu (JwtAuthGuard). Zgłoszenia nadużyć z abuse@ (treść, dane zgłaszającego, dowody)
 * widzi i obsługuje tylko zespół nadużyć — uprawnienie ABUSE_MANAGE (jak kolejka staff/abuse) albo ADMIN.
 */
export interface AktorPoczty {
  userId: string;
  role?: string;
  principalUserId?: string;
}
export const TYLKO_ZESPOL_NADUZYC = 'Zgłoszenia z abuse@ obsługuje zespół nadużyć (uprawnienie „Nadużycia / abuse”).';

type Wynik = 'ZGLOSZENIE' | 'ODPOWIEDZ' | 'BEZ_KLIENTA' | 'SPAM' | 'BLOKADA' | 'AUTO' | 'ZA_DUZY';

interface ZapisanyZalacznik {
  nazwa: string;
  typ?: string;
  rozmiar?: number;
  klucz?: string;
  pominiety?: string;
}

export interface KonfigImap {
  host: string;
  port: number;
  login: string;
  haslo: string;
  odcisk?: string;
}

@Injectable()
export class PocztaPrzychodzacaService {
  private readonly logger = new Logger('PocztaZgloszen');
  private trwa = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tickets: TicketsService,
    private readonly storage: ObjectStorageService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  konfiguracja(): KonfigImap | null {
    const login = this.config.get<string>('CONTROL_PLANE_MAIL_TICKETS_USER')?.trim();
    const haslo = this.config.get<string>('CONTROL_PLANE_MAIL_TICKETS_PASSWORD');
    if (!login || !haslo) return null;
    return {
      host: this.config.get<string>('CONTROL_PLANE_MAIL_HOST')?.trim() || 'mail.verris.pl',
      port: Number(this.config.get<string>('CONTROL_PLANE_MAIL_IMAP_PORT')) || 993,
      login,
      haslo,
      odcisk: this.config.get<string>('CONTROL_PLANE_MAIL_TICKETS_CERT_SHA256')?.trim() || undefined,
    };
  }

  /** Domena naszego Message-ID (wątek) i domena skrzynek zespołu (pętla, adres abuse@). */
  private domeny() {
    return { msgId: resolveSmtpIdentity().messageIdDomain.toLowerCase(), zespol: CONTROL_PLANE_MAIL_DOMAIN };
  }

  @Cron('*/2 * * * *', { name: 'tickets:poczta-przychodzaca' })
  async przebieg(): Promise<void> {
    const k = this.konfiguracja();
    if (!k || this.trwa) return;
    this.trwa = true;
    try {
      await this.pobierz(k);
    } finally {
      this.trwa = false;
    }
  }

  /**
   * Jeden przebieg na otwartym połączeniu (test podaje własne gniazdo). Błąd połączenia/IMAP = wyjątek (rejestr zadań
   * w tle go pokaże); błąd jednego maila nie zatrzymuje reszty, ale na końcu przebieg kończy się wyjątkiem.
   */
  async pobierz(k: KonfigImap, polacz = () => polaczTls({ host: k.host, port: k.port, odcisk: k.odcisk, timeoutMs: 30_000 })) {
    const imap = new PolaczenieImap(await polacz());
    const wynik = { nowe: 0, bledy: [] as string[] };
    try {
      await imap.powitanie();
      await imap.zaloguj(k.login, k.haslo);
      await imap.wybierz('INBOX');
      const uidy = (await imap.szukajBezSlowa(SLOWO_ZAIMPORTOWANY, new Date(Date.now() - OKNO_DNI * 86_400_000))).slice(0, MAX_NA_PRZEBIEG);
      for (const uid of uidy) {
        try {
          if (await this.przetworz(imap, uid, k.login)) wynik.nowe += 1;
          await imap.oznacz(uid, SLOWO_ZAIMPORTOWANY);
        } catch (e) {
          if (e instanceof BladImap) throw e;
          wynik.bledy.push(`UID ${uid}: ${(e as Error).message}`.slice(0, 300));
          this.logger.error(`Mail UID ${uid} nie zaimportowany: ${(e as Error).message}`);
        }
      }
    } finally {
      await imap.wyloguj();
    }
    if (wynik.bledy.length) throw new Error(`Nie zaimportowano ${wynik.bledy.length} maili: ${wynik.bledy.join('; ')}`);
    return wynik;
  }

  /** Jeden mail. true = nowy wpis; false = już był (inny proces albo wcześniejszy przebieg bez słowa kluczowego). */
  async przetworz(imap: Pick<PolaczenieImap, 'naglowki' | 'wiadomosc'>, uid: number, skrzynka: string): Promise<boolean> {
    const { rozmiar, naglowki } = await imap.naglowki(uid);
    const n = await parsujNaglowki(naglowki);
    if (await this.prisma.pocztaPrzychodzaca.findUnique({ where: { messageId: n.messageId }, select: { id: true } })) return false;
    const { msgId, zespol } = this.domeny();
    const baza = {
      messageId: n.messageId,
      skrzynka,
      uid,
      nadawca: n.nadawca.slice(0, 320),
      nadawcaNazwa: n.nadawcaNazwa?.slice(0, 200) ?? null,
      temat: n.temat.slice(0, 500),
      doAdresy: n.doAdresy.slice(0, 20),
      rodzaj: this.rodzaj(n, zespol),
      otrzymano: dataOtrzymania(n.data, new Date()),
      rozmiar,
    };
    const zapisz = (dane: Partial<Prisma.PocztaPrzychodzacaUncheckedCreateInput> & { wynik: Wynik }) => this.zapiszWpis({ ...baza, ...dane });

    const wzorce = (await this.prisma.pocztaBlokadaNadawcy.findMany({ select: { wzorzec: true } })).map((b) => b.wzorzec);
    const blok = zablokowany(n.nadawca, wzorce);
    // Przegląd poprawek Fali 3 — blokada (także założona osobną trasą „zablokuj” przez osobę, która zmieniła e-mail
    // klienta) nie wycisza POPRZEDNIEGO adresu klienta w dobie po zmianie przez obsługę: to kanał zgłoszenia przejęcia.
    if (blok && !(await this.poprzedniAdres(n.nadawca))) return zapisz({ wynik: 'BLOKADA', powod: `lista blokad: ${blok}` });
    const auto = powodAutomatu(n, [zespol, msgId]);
    if (auto) return zapisz({ wynik: 'AUTO', powod: auto });
    if (rozmiar > MAX_ROZMIAR_MAILA) return zapisz({ wynik: 'ZA_DUZY', powod: `${Math.round(rozmiar / 1024 / 1024)} MB` });

    const m = await parsujMail(await imap.wiadomosc(uid));
    // Ten sam Message-ID co w nagłówkach (pełny rozbiór nie zmienia identyfikatora).
    m.messageId = n.messageId;
    const spam = powodSpamu(m.naglowki);
    if (spam) {
      return zapisz({
        wynik: 'SPAM',
        powod: spam,
        tresc: m.tekst,
        zalaczniki: [...m.zalaczniki.map((z) => ({ nazwa: z.nazwa, pominiety: 'spam — nie zapisano' })), ...pominiete(m.pominiete)] as never,
      });
    }

    // DMARC fail — adresowi nadawcy nie ufamy (podszycie pod klienta). Audyt Fali 3: ops/rspamd/local.d/milter_headers.conf
    // nie włącza rutyny `authentication-results` (https://rspamd.com/doc/modules/milter_headers.html), więc nagłówek
    // mógł dopisać sam nadawca — działa tylko w stronę ostrożności (do kolejki). Wyniku „pass” nie używamy nigdzie:
    // zgłoszenia i odpowiedzi z maila mają źródło EMAIL i tag „e-mail-niezweryfikowany” i nie są dowodem klienta dla
    // operacji wrażliwych (zgloszenie-klienta.ts). NIEZWERYFIKOWANE z dokumentacją — sprawdzić na t1.
    const dmarcFail = m.naglowki.some((h) => h.key === 'authentication-results' && /\bdmarc=fail\b/i.test(h.value));
    const klient = dmarcFail ? null : await this.klient(m.nadawca);
    const zWatku = await this.zgloszenieZWatku(m, msgId, klient?.id ?? null);
    const odmowa =
      klient?.odmowa ??
      (klient && !zWatku && (await this.nowychWOstatniejGodzinie(klient.id)) >= LIMIT_NOWYCH_NA_GODZINE
        ? `ponad ${LIMIT_NOWYCH_NA_GODZINE} nowych zgłoszeń z maili w godzinę (pętla autoodpowiedzi?)`
        : null);

    if (klient && !odmowa && zWatku && zWatku.userId === klient.id) {
      return this.zapiszOdpowiedz(m, baza, klient.id, zWatku.id);
    }
    if (klient && !odmowa && !zWatku) {
      return this.zapiszZgloszenie(m, baza, klient.id);
    }
    return this.zapiszDoKolejki(m, baza, {
      powod:
        odmowa ??
        (dmarcFail ? 'DMARC: adres nadawcy niepotwierdzony' : klient ? 'nadawca nie jest właścicielem zgłoszenia z wątku' : 'nadawca spoza kont klientów'),
      userId: klient?.id ?? null,
      sugerowaneZgloszenieId: zWatku?.id ?? null,
    });
  }

  private rodzaj(n: Pick<MailPrzychodzacy, 'doAdresy' | 'naglowki'>, zespol: string): 'SUPPORT' | 'ABUSE' {
    const abuse = `abuse@${zespol}`.toLowerCase();
    // Dokładny adres, nie fragment („notabuse@…” to nie abuse@). Przegląd F3.7.
    const adresaci = [
      ...n.doAdresy,
      ...n.naglowki.filter((h) => ['delivered-to', 'x-original-to'].includes(h.key)).map((h) => h.value.trim().replace(/^<|>$/g, '').toLowerCase()),
    ];
    return adresaci.includes(abuse) ? 'ABUSE' : 'SUPPORT';
  }

  /**
   * Konto klienta po adresie nadawcy (subkonto → właściciel konta, jak w panelu). Nieaktywne/usunięte — brak.
   * Subkonto pisze w imieniu właściciela tylko wtedy, gdy mogłoby to zrobić w panelu: aktywne, właściciel dostępny
   * (jwt.strategy.ts) i z uprawnieniem TICKETS_MANAGE (customer-permissions.guard.ts, reguła „tickets”). Inaczej
   * `odmowa` — mail idzie do kolejki z podpowiedzią konta (przegląd F3.7: wyłączone subkonto albo bez uprawnień do
   * zgłoszeń zakładało zgłoszenia i dopisywało się do wątków właściciela).
   */
  private async klient(nadawca: string): Promise<{ id: string; odmowa?: string } | null> {
    if (!nadawca) return null;
    const u = await this.prisma.user.findFirst({
      where: { email: { equals: nadawca, mode: 'insensitive' }, role: 'USER', anonymizedAt: null },
      select: { id: true, customerOwnerId: true, customerPermissions: true, subaccountDisabledAt: true },
    });
    if (!u) return this.poprzedniAdres(nadawca);
    const k = await this.klientKonta(u);
    // Audyt Fali 3 — adres konta zmieniony przez obsługę w ostatnich 24 h: maila z NOWEGO adresu nie przyjmujemy
    // automatycznie jako klienta (pracownik mógł wpisać swój adres) — kolejka z podpowiedzią konta.
    if (k && !k.odmowa && (await zmianyEmailaPrzezObsluge(this.prisma, u.id)).length) {
      return { id: k.id, odmowa: `adres e-mail konta zmieniła obsługa w ciągu ${BLOKADA_RESETU_PO_ZMIANIE_EMAILA_H} h — potwierdź tożsamość klienta` };
    }
    return k;
  }

  /**
   * Audyt Fali 3 — mail z POPRZEDNIEGO adresu klienta w 24 h po zmianie przez obsługę (alert o zmianie trafia na stary
   * adres): to może być klient, którego konto przejęto. Kolejka z podpowiedzią konta i ostrzeżeniem, nie „obcy nadawca”.
   */
  private async poprzedniAdres(nadawca: string): Promise<{ id: string; odmowa: string } | null> {
    const adres = nadawca.trim().toLowerCase();
    if (!adres) return null;
    const wpisy = await this.prisma.auditLog.findMany({
      where: { action: AdminCustomerActions.CUSTOMER_EMAIL_CHANGED, createdAt: { gte: new Date(Date.now() - BLOKADA_RESETU_PO_ZMIANIE_EMAILA_H * 3600_000) } },
      select: { userId: true, details: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const w = wpisy.find((x) => x.userId && String((x.details as { fromEmail?: unknown } | null)?.fromEmail ?? '').toLowerCase() === adres);
    return w?.userId
      ? { id: w.userId, odmowa: `POPRZEDNI adres klienta — e-mail konta zmieniła obsługa w ciągu ${BLOKADA_RESETU_PO_ZMIANIE_EMAILA_H} h; możliwe przejęcie konta, przekaż pilnie administratorowi` }
      : null;
  }

  /** Subkonto → właściciel (reguły jak w panelu); null — właściciel niedostępny. */
  private async klientKonta(u: { id: string; customerOwnerId: string | null; customerPermissions: string[]; subaccountDisabledAt: Date | null }): Promise<{ id: string; odmowa?: string } | null> {
    if (!u.customerOwnerId) return { id: u.id };
    const wl = await this.prisma.user.findFirst({ where: { id: u.customerOwnerId, anonymizedAt: null }, select: { id: true, loginBlocked: true } });
    if (!wl) return null;
    if (u.subaccountDisabledAt || wl.loginBlocked) return { id: wl.id, odmowa: 'subkonto wyłączone albo konto właściciela zablokowane' };
    if (!u.customerPermissions.includes('TICKETS_MANAGE')) return { id: wl.id, odmowa: 'subkonto bez uprawnienia do zgłoszeń' };
    return { id: wl.id };
  }

  /** Nowe zgłoszenia z maili tego konta w ostatniej godzinie (hamulec pętli, LIMIT_NOWYCH_NA_GODZINE). */
  private nowychWOstatniejGodzinie(userId: string): Promise<number> {
    return this.prisma.pocztaPrzychodzaca.count({ where: { userId, wynik: 'ZGLOSZENIE', createdAt: { gte: new Date(Date.now() - 3600_000) } } });
  }

  /** Zgłoszenie z nagłówków wątku (pełne id, nasza domena) albo z „[#xxxxxxxx]” w temacie — tylko wśród zgłoszeń klienta. */
  private async zgloszenieZWatku(m: MailPrzychodzacy, domena: string, klientId: string | null): Promise<{ id: string; userId: string } | null> {
    const id = zgloszenieZNaglowkow(m.watek, domena);
    if (id) {
      const t = await this.prisma.ticket.findUnique({ where: { id }, select: { id: true, userId: true, scalonoDoId: true } });
      if (t) return this.poScaleniu(t);
    }
    const krotkie = krotkieIdZTematu(m.temat);
    if (krotkie && klientId) {
      const t = await this.prisma.ticket.findMany({ where: { userId: klientId, id: { startsWith: krotkie } }, select: { id: true, userId: true, scalonoDoId: true }, take: 2 });
      if (t.length === 1) return this.poScaleniu(t[0]);
    }
    return null;
  }

  /**
   * F3.7 — odpowiedź na mail scalonego zgłoszenia trafia do zgłoszenia docelowego (klient odpisuje na stary wątek).
   * Łańcuch scaleń najwyżej kilka kroków; cel zawsze tego samego klienta (scalanie tylko w obrębie klienta).
   */
  private async poScaleniu(t: { id: string; userId: string; scalonoDoId: string | null }): Promise<{ id: string; userId: string }> {
    let biezace = t;
    for (let i = 0; i < 5 && biezace.scalonoDoId; i++) {
      const nast = await this.prisma.ticket.findUnique({ where: { id: biezace.scalonoDoId }, select: { id: true, userId: true, scalonoDoId: true } });
      if (!nast || nast.userId !== t.userId) break;
      biezace = nast;
    }
    return { id: biezace.id, userId: biezace.userId };
  }

  private async zapiszOdpowiedz(m: MailPrzychodzacy, baza: Omit<Prisma.PocztaPrzychodzacaUncheckedCreateInput, 'wynik'>, userId: string, ticketId: string) {
    return this.jednokrotnie(async () => {
      const r = await this.tickets.odpowiedzZPoczty(ticketId, userId, trescZgloszenia(m), m.zalaczniki, (replyId) =>
        this.prisma.pocztaPrzychodzaca.create({ data: { ...baza, wynik: 'ODPOWIEDZ', ticketId, replyId, userId, zalaczniki: pominiete(m.pominiete) as never } }),
      );
      if (r.pominietePliki) this.logger.warn(`Zgłoszenie ${ticketId}: limit załączników — pominięto ${r.pominietePliki}`);
    });
  }

  private async zapiszZgloszenie(m: MailPrzychodzacy, baza: Omit<Prisma.PocztaPrzychodzacaUncheckedCreateInput, 'wynik'>, userId: string) {
    return this.jednokrotnie(async () => {
      await this.tickets.utworzZPoczty(
        userId,
        {
          subject: tematZgloszenia(m.temat),
          message: trescZgloszenia(m),
          department: 'TECHNICAL',
          // Audyt Fali 3 — adres nadawcy nieuwierzytelniony: tag dla obsługi; treść nie jest dowodem klienta (zrodlo EMAIL).
          tags: baza.rodzaj === 'ABUSE' ? ['e-mail', TAG_EMAIL_NIEZWERYFIKOWANY, 'abuse'] : ['e-mail', TAG_EMAIL_NIEZWERYFIKOWANY],
        },
        m.zalaczniki,
        (ticketId) => this.prisma.pocztaPrzychodzaca.create({ data: { ...baza, wynik: 'ZGLOSZENIE', ticketId, userId, zalaczniki: pominiete(m.pominiete) as never } }),
      );
    });
  }

  /** Kolejka: treść i bezpieczne załączniki (w magazynie, pokazywane dopiero po „Pokaż”). */
  private async zapiszDoKolejki(
    m: MailPrzychodzacy,
    baza: Omit<Prisma.PocztaPrzychodzacaUncheckedCreateInput, 'wynik'>,
    o: { powod: string; userId: string | null; sugerowaneZgloszenieId: string | null },
  ) {
    const id = randomUUID();
    const zapisane: ZapisanyZalacznik[] = [];
    for (const z of m.zalaczniki) {
      const klucz = `poczta/${id}/${randomUUID()}_${z.nazwa}`;
      await this.storage.putObject(ObjectBuckets.TICKET_ATTACHMENTS, klucz, z.tresc, {
        contentType: z.typ,
        originalFilename: z.nazwa,
        custom: { zrodlo: 'poczta-bez-klienta' },
      });
      zapisane.push({ nazwa: z.nazwa, typ: z.typ, rozmiar: z.tresc.length, klucz });
    }
    try {
      return await this.zapiszWpis({
        ...baza,
        id,
        wynik: 'BEZ_KLIENTA',
        powod: o.powod,
        tresc: m.tekst,
        userId: o.userId,
        sugerowaneZgloszenieId: o.sugerowaneZgloszenieId,
        zalaczniki: [...zapisane, ...pominiete(m.pominiete)] as never,
      });
    } finally {
      // Wpis już był (inny proces) — pliki tego przebiegu są zbędne.
      if (!(await this.prisma.pocztaPrzychodzaca.findUnique({ where: { id }, select: { id: true } }))) {
        for (const z of zapisane) await this.usunPlik(z.klucz!);
      }
    }
  }

  private async zapiszWpis(dane: Prisma.PocztaPrzychodzacaUncheckedCreateInput): Promise<boolean> {
    return this.jednokrotnie(() => this.prisma.pocztaPrzychodzaca.create({ data: dane }));
  }

  /** Błąd unikalności Message-ID = mail już zapisał inny proces → false (bez dubla zgłoszenia). */
  private async jednokrotnie(fn: () => Promise<unknown>): Promise<boolean> {
    try {
      await fn();
      return true;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return false;
      throw e;
    }
  }

  private async usunPlik(klucz: string) {
    try {
      await this.storage.removeObject(ObjectBuckets.TICKET_ATTACHMENTS, klucz);
    } catch {
      /* brak obiektu — nic do usunięcia */
    }
  }

  // ------------------------------------------------------------------ kolejka (panel operatora)

  /** Audyt Fali 3 — ADMIN albo STAFF z ABUSE_MANAGE (suma ról, jak StaffPermissionsGuard). */
  private async zespolNaduzyc(aktor: AktorPoczty): Promise<boolean> {
    if (aktor.role === 'ADMIN') return true;
    return (await uprawnieniaOperatora(this.prisma, aktor.principalUserId ?? aktor.userId).catch(() => [] as string[])).includes('ABUSE_MANAGE');
  }

  private async pilnujNaduzyc(w: { rodzaj: string }, aktor: AktorPoczty) {
    if (w.rodzaj === 'ABUSE' && !(await this.zespolNaduzyc(aktor))) throw new ForbiddenException(TYLKO_ZESPOL_NADUZYC);
  }

  /**
   * Audyt Fali 3 — maile do abuse@ (zgłoszenia nadużyć osób trzecich) tylko dla zespołu nadużyć: pozostali z
   * TICKETS_VIEW (L1, Finanse, Sprzedaż, NOC, Audytor) nie widzą ich na liście ani w licznikach.
   */
  async lista(q: { widok?: string; page?: string; limit?: string }, aktor: AktorPoczty) {
    const widok = q.widok === 'spam' ? 'spam' : q.widok === 'wszystkie' ? 'wszystkie' : 'kolejka';
    const zakres: Prisma.PocztaPrzychodzacaWhereInput = (await this.zespolNaduzyc(aktor)) ? {} : { rodzaj: { not: 'ABUSE' } };
    const where: Prisma.PocztaPrzychodzacaWhereInput =
      widok === 'kolejka' ? { ...zakres, wynik: 'BEZ_KLIENTA' } : widok === 'spam' ? { ...zakres, wynik: 'SPAM' } : zakres;
    const { limit, page, skip } = stronaListy(q, 25, 100);
    const [rows, total, kolejka, spam] = await Promise.all([
      this.prisma.pocztaPrzychodzaca.findMany({ where, orderBy: [{ otrzymano: 'desc' }, { id: 'desc' }], skip, take: limit }),
      this.prisma.pocztaPrzychodzaca.count({ where }),
      this.prisma.pocztaPrzychodzaca.count({ where: { ...zakres, wynik: 'BEZ_KLIENTA' } }),
      this.prisma.pocztaPrzychodzaca.count({ where: { ...zakres, wynik: 'SPAM' } }),
    ]);
    return {
      rows: rows.map((r) => ({
        ...r,
        // Bez kluczy magazynu w odpowiedzi — plik tylko przez trasę „Pokaż”.
        zalaczniki: listaZalacznikow(r.zalaczniki).map(({ klucz, ...z }, nr) => ({ ...z, nr, dostepny: !!klucz })),
      })),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      liczby: { kolejka, spam },
      konfiguracja: !!this.konfiguracja(),
    };
  }

  /** Plik od nieznanego nadawcy — tylko po świadomym „Pokaż” (potwierdzenie), zawsze jako pobranie, nie podgląd. */
  async plik(id: string, nr: number, potwierdzam: boolean, aktor: AktorPoczty): Promise<{ stream: Readable; nazwa: string; typ: string }> {
    if (!potwierdzam) {
      throw new BadRequestException('Plik od nieznanego nadawcy, bez skanu antywirusowego — potwierdź „Pokaż”, żeby go pobrać.');
    }
    const w = await this.prisma.pocztaPrzychodzaca.findUnique({ where: { id }, select: { zalaczniki: true, nadawca: true, rodzaj: true } });
    const z = w ? listaZalacznikow(w.zalaczniki)[nr] : undefined;
    if (!w || !z?.klucz) throw new NotFoundException('Nie ma takiego pliku.');
    await this.pilnujNaduzyc(w, aktor);
    await this.audit.record({ action: 'POCZTA_ZGLOSZEN_PLIK_POKAZANY', actorUserId: aktor.userId, details: { pocztaId: id, plik: z.nazwa, nadawca: w.nadawca } });
    return { stream: await this.storage.getObjectStream(ObjectBuckets.TICKET_ATTACHMENTS, z.klucz), nazwa: z.nazwa, typ: z.typ ?? 'application/octet-stream' };
  }

  private async wKolejce(id: string) {
    const w = await this.prisma.pocztaPrzychodzaca.findUnique({ where: { id } });
    if (!w) throw new NotFoundException('Nie ma takiej wiadomości.');
    if (!(W_KOLEJCE as readonly string[]).includes(w.wynik)) throw new ConflictException('Tę wiadomość ktoś już obsłużył — odśwież listę.');
    return w;
  }

  /**
   * Nowe zgłoszenie dla wskazanego klienta z treści maila (nadawca spoza konta, np. drugi adres klienta). Pliki zostają
   * w kolejce (za „Pokaż”) — do zgłoszenia trafia notatka wewnętrzna z informacją o nich, klient ich nie widzi.
   *
   * Audyt Fali 3 — mail z abuse@ (zgłoszenie nadużycia osoby trzeciej) dopisany do zgłoszenia klienta: notatka bez
   * treści i bez danych zgłaszającego (notatki wewnętrzne są w eksporcie RODO klienta — F2.5 — a zgłaszający jest
   * chroniony art. 15 ust. 4 RODO; do tego notatkę widzi każdy z TICKETS_VIEW). Treść i pliki zostają we wpisie
   * kolejki (widok „Wszystkie”, tylko zespół nadużyć), wpis nie dostaje userId klienta (to nie są jego dane — ani
   * eksport, ani anonimizacja klienta ich nie dotyczą), a wpis dziennika jest dziennikiem zespołu (bez userId klienta).
   */
  async przypisz(id: string, aktor: AktorPoczty, dto: { userId?: string; email?: string; zgloszenieId?: string }) {
    const actorUserId = aktor.userId;
    const w = await this.wKolejce(id);
    await this.pilnujNaduzyc(w, aktor);
    if ([dto.userId, dto.email, dto.zgloszenieId].filter(Boolean).length !== 1) throw new BadRequestException('Wskaż klienta albo zgłoszenie.');
    const abuse = w.rodzaj === 'ABUSE';
    const pliki = listaZalacznikow(w.zalaczniki).filter((z) => z.klucz);
    const kiedy = `${w.otrzymano.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
    const opis = `Mail od ${w.nadawcaNazwa ? `${w.nadawcaNazwa} ` : ''}<${w.nadawca}> (${kiedy})`;
    const notatkaPlikow = pliki.length ? ` Załączniki (${pliki.length}): ${pliki.map((p) => p.nazwa).join(', ')} — w „Poczta bez klienta”, za „Pokaż”.` : '';
    let ticketId: string;
    if (dto.userId || dto.email) {
      const k = await this.prisma.user.findFirst({
        where: {
          ...(dto.userId ? { id: dto.userId } : { email: { equals: dto.email!.trim(), mode: 'insensitive' as const } }),
          role: 'USER',
          anonymizedAt: null,
          customerOwnerId: null,
        },
        select: { id: true },
      });
      if (!k) throw new NotFoundException('Nie znaleziono konta klienta.');
      // Zgłoszenie nadużycia od obcego nadawcy nie staje się wiadomością widoczną dla klienta (zwykle zgłaszanego):
      // treść i podpis zgłaszającego to jego dane. Do sprawy klienta — notatka wewnętrzna („Dopisz do zgłoszenia”).
      // Przegląd F3.7.
      if (abuse) {
        throw new BadRequestException('Mail z abuse@ dopisz do zgłoszenia jako notatkę — klient nie może zobaczyć treści ani danych zgłaszającego.');
      }
      // Zajęcie wpisu przed utworzeniem zgłoszenia — dwa kliknięcia nie założą dwóch zgłoszeń.
      await this.zajmij(id, w.wynik, actorUserId);
      try {
        ticketId = (
          // Audyt Fali 3 — treść obcego maila przypisana przez obsługę to nie wiadomość klienta (dowód klienta: tylko PANEL).
          await this.tickets.create(
            k.id,
            { subject: tematZgloszenia(w.temat), message: w.tresc?.trim() || '(pusta wiadomość)', department: 'TECHNICAL' },
            { zrodlo: 'OBSLUGA' },
          )
        ).id;
      } catch (e) {
        await this.prisma.pocztaPrzychodzaca.update({ where: { id }, data: { wynik: w.wynik, obsluzylId: null, obsluzono: null } });
        throw e;
      }
      await this.tickets.adminAddNote(ticketId, actorUserId, `${opis} — zgłoszenie założone z poczty bez klienta.${notatkaPlikow}`, { zrodlo: 'poczta' });
    } else {
      const nr = dto.zgloszenieId!.toLowerCase();
      const pasujace = await this.prisma.ticket.findMany({ where: nr.length === 8 ? { id: { startsWith: nr } } : { id: nr }, select: { id: true }, take: 2 });
      if (pasujace.length !== 1) throw new NotFoundException(pasujace.length ? 'Kilka zgłoszeń pasuje do numeru — podaj pełny identyfikator.' : 'Nie znaleziono zgłoszenia.');
      const t = pasujace[0];
      await this.zajmij(id, w.wynik, actorUserId);
      ticketId = t.id;
      const notatka = abuse
        ? `Zgłoszenie nadużycia z abuse@ (wpis ${id.slice(0, 8)}, ${kiedy}) dopisane do tego zgłoszenia. Treść, nadawcę i załączniki widzi zespół nadużyć w „Poczta bez klienta” (widok „Wszystkie”).`
        : `${opis}:\n\n${(w.tresc ?? '').slice(0, 20_000)}${notatkaPlikow}`;
      await this.tickets.adminAddNote(ticketId, actorUserId, notatka, { zrodlo: 'poczta' });
    }
    const userId = (await this.prisma.ticket.findUniqueOrThrow({ where: { id: ticketId }, select: { userId: true } })).userId;
    await this.prisma.pocztaPrzychodzaca.update({ where: { id }, data: abuse ? { ticketId } : { ticketId, userId, tresc: null } });
    await this.audit.record({
      action: 'POCZTA_ZGLOSZEN_PRZYPISANA',
      userId: abuse ? null : userId,
      actorUserId,
      details: { pocztaId: id, ticketId, nadawca: w.nadawca, ...(abuse ? { rodzaj: 'ABUSE' } : {}) },
    });
    return { ticketId };
  }

  private async zajmij(id: string, wynik: string, actorUserId: string) {
    const { count } = await this.prisma.pocztaPrzychodzaca.updateMany({
      where: { id, wynik },
      data: { wynik: 'PRZYPISANY', obsluzylId: actorUserId, obsluzono: new Date() },
    });
    if (count !== 1) throw new ConflictException('Tę wiadomość ktoś już obsłużył — odśwież listę.');
  }

  /** Odrzucenie (spam albo nie do nas): treść i pliki kasowane od razu; opcjonalnie blokada nadawcy. */
  async odrzuc(id: string, aktor: AktorPoczty, dto: { powod: string; zablokuj?: boolean }) {
    const actorUserId = aktor.userId;
    const powod = dto.powod?.trim() ?? '';
    if (powod.length < 3) throw new BadRequestException('Podaj powód odrzucenia.');
    const w = await this.wKolejce(id);
    // Audyt Fali 3 — odrzucenie kasuje treść i pliki zgłoszenia nadużycia: tylko zespół nadużyć.
    await this.pilnujNaduzyc(w, aktor);
    // Audyt Fali 3 — mail dotyczący konta, którego e-mail ta sama osoba zmieniła w ostatnich 24 h (np. sprzeciw klienta
    // ze starego adresu), odrzuca ktoś inny: sprawca nie wygasi kanału, którym klient zgłasza przejęcie konta.
    if (w.userId && (await zmianyEmailaPrzezObsluge(this.prisma, w.userId)).includes(aktor.principalUserId ?? aktor.userId)) {
      throw new ForbiddenException('Ten mail dotyczy konta, którego adres e-mail zmieniłeś w ciągu doby — odrzuci go inna osoba albo administrator.');
    }
    const { count } = await this.prisma.pocztaPrzychodzaca.updateMany({
      where: { id, wynik: w.wynik },
      data: { wynik: 'ODRZUCONY', powod: powod.slice(0, 300), tresc: null, obsluzylId: actorUserId, obsluzono: new Date(), zalaczniki: [] },
    });
    if (count !== 1) throw new ConflictException('Tę wiadomość ktoś już obsłużył — odśwież listę.');
    for (const z of listaZalacznikow(w.zalaczniki)) if (z.klucz) await this.usunPlik(z.klucz);
    if (dto.zablokuj && w.nadawca) await this.zablokuj(w.nadawca, `odrzucony mail: ${powod}`, aktor);
    await this.audit.record({ action: 'POCZTA_ZGLOSZEN_ODRZUCONA', actorUserId, details: { pocztaId: id, nadawca: w.nadawca, powod, zablokowano: !!dto.zablokuj } });
    return { ok: true as const };
  }

  // ------------------------------------------------------------------ blokady nadawców

  async blokady() {
    return this.prisma.pocztaBlokadaNadawcy.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async zablokuj(wzorzec: string, powod: string | undefined, aktor: AktorPoczty) {
    const actorUserId = aktor.userId;
    const w = normalizujWzorzec(wzorzec);
    if (!w) throw new BadRequestException('Podaj adres (jan@firma.pl) albo domenę (@firma.pl).');
    if (w.endsWith(`@${CONTROL_PLANE_MAIL_DOMAIN}`) || w === `@${CONTROL_PLANE_MAIL_DOMAIN}`) throw new BadRequestException('Nie blokujemy własnej domeny.');
    // Audyt Fali 3 — blokada całej domeny wycisza też zgłoszenia nadużyć z tej domeny (CERT, inny hosting): tylko zespół
    // nadużyć albo ADMIN. Pojedynczy adres (spamer) — jak dotąd TICKETS_MANAGE.
    if (w.startsWith('@') && !(await this.zespolNaduzyc(aktor))) {
      throw new ForbiddenException('Blokadę całej domeny zakłada zespół nadużyć albo administrator — zablokuj konkretny adres.');
    }
    const row = await this.prisma.pocztaBlokadaNadawcy.upsert({
      where: { wzorzec: w },
      create: { wzorzec: w, powod: powod?.trim().slice(0, 300) || null, createdById: actorUserId },
      update: {},
    });
    await this.audit.record({ action: 'POCZTA_ZGLOSZEN_BLOKADA_DODANA', actorUserId, details: { wzorzec: w, powod: powod ?? null } });
    return row;
  }

  async odblokuj(wzorzec: string, actorUserId: string) {
    const w = wzorzec.trim().toLowerCase();
    const { count } = await this.prisma.pocztaBlokadaNadawcy.deleteMany({ where: { wzorzec: w } });
    if (!count) throw new NotFoundException('Nie ma takiej blokady.');
    await this.audit.record({ action: 'POCZTA_ZGLOSZEN_BLOKADA_USUNIETA', actorUserId, details: { wzorzec: w } });
    return { ok: true as const };
  }

  // ------------------------------------------------------------------ retencja

  /**
   * Wpisy bez zgłoszenia starsze niż 90 dni (z plikami w magazynie) — dane obcych nadawców nie leżą bez końca.
   * Audyt Fali 3 — wpisy przypisane do zgłoszenia zostają (Message-ID wątku maili, mailer.service.ts), ale po 90 dniach
   * tracą pliki w magazynie i treść (mail z abuse@ zostawia ją we wpisie dla zespołu nadużyć). Wcześniej retencja
   * ich nie widziała (`ticketId: null`), więc pliki obcych nadawców po „Przypisz” leżały bez terminu.
   */
  @Cron('20 4 * * *', { name: 'tickets:poczta-retencja' })
  async retencja(teraz = new Date()): Promise<number> {
    const granica = new Date(teraz.getTime() - RETENCJA_DNI * 86_400_000);
    const stare = await this.prisma.pocztaPrzychodzaca.findMany({
      where: { ticketId: null, createdAt: { lt: granica } },
      select: { id: true, zalaczniki: true },
      take: 1000,
    });
    for (const w of stare) for (const z of listaZalacznikow(w.zalaczniki)) if (z.klucz) await this.usunPlik(z.klucz);
    if (stare.length) await this.prisma.pocztaPrzychodzaca.deleteMany({ where: { id: { in: stare.map((w) => w.id) } } });

    const przypisane = await this.prisma.$queryRaw<Array<{ id: string; zalaczniki: Prisma.JsonValue }>>`
      SELECT "id", "zalaczniki" FROM "PocztaPrzychodzaca"
      WHERE "ticketId" IS NOT NULL AND "createdAt" < ${granica}
        AND ("tresc" IS NOT NULL OR jsonb_path_exists("zalaczniki", '$[*].klucz'))
      LIMIT 1000`;
    for (const w of przypisane) {
      const pliki = listaZalacznikow(w.zalaczniki);
      for (const z of pliki) if (z.klucz) await this.usunPlik(z.klucz);
      await this.prisma.pocztaPrzychodzaca.update({
        where: { id: w.id },
        data: { tresc: null, zalaczniki: pliki.map(({ klucz, ...z }) => (klucz ? { ...z, pominiety: 'usunięty po 90 dniach (retencja)' } : z)) as never },
      });
    }
    return stare.length + przypisane.length;
  }
}

function listaZalacznikow(json: Prisma.JsonValue): ZapisanyZalacznik[] {
  return Array.isArray(json) ? (json as unknown as ZapisanyZalacznik[]).filter((z) => z && typeof z.nazwa === 'string') : [];
}

const pominiete = (p: readonly PominietyZalacznik[]): ZapisanyZalacznik[] => p.map((x) => ({ nazwa: x.nazwa, pominiety: x.powod }));

/** Treść wpisu w zgłoszeniu: tekst maila i lista pominiętych plików (klient wie, czego nie dostaliśmy). */
function trescZgloszenia(m: MailPrzychodzacy): string {
  const tekst = m.tekst.trim() || '(pusta wiadomość)';
  if (!m.pominiete.length) return tekst;
  return `${tekst}\n\n${m.pominiete.map((p) => `[Nie dołączono pliku „${p.nazwa}” — ${p.powod}. Dozwolone: PDF, JPG, PNG, GIF, WebP, TXT, CSV, LOG do 8 MB.]`).join('\n')}`;
}
