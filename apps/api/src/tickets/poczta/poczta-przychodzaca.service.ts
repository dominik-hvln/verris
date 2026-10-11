import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
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
import { TicketsService } from '../tickets.service.js';
import { BladImap, PolaczenieImap, polaczTls } from './imap.js';
import {
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
/** Wyniki, które czekają na decyzję obsługi. */
export const W_KOLEJCE = ['BEZ_KLIENTA', 'SPAM'] as const;

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
      otrzymano: n.data ?? new Date(),
      rozmiar,
    };
    const zapisz = (dane: Partial<Prisma.PocztaPrzychodzacaUncheckedCreateInput> & { wynik: Wynik }) => this.zapiszWpis({ ...baza, ...dane });

    const wzorce = (await this.prisma.pocztaBlokadaNadawcy.findMany({ select: { wzorzec: true } })).map((b) => b.wzorzec);
    const blok = zablokowany(n.nadawca, wzorce);
    if (blok) return zapisz({ wynik: 'BLOKADA', powod: `lista blokad: ${blok}` });
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

    // DMARC fail dopisany przez nasz serwer poczty — adresowi nadawcy nie ufamy (podszycie pod klienta).
    // NIEZWERYFIKOWANE z dokumentacją Rspamd (nagłówek Authentication-Results) — sprawdzić na t1.
    const dmarcFail = m.naglowki.some((h) => h.key === 'authentication-results' && /\bdmarc=fail\b/i.test(h.value));
    const klient = dmarcFail ? null : await this.klient(m.nadawca);
    const zWatku = await this.zgloszenieZWatku(m, msgId, klient?.id ?? null);

    if (klient && zWatku && zWatku.userId === klient.id) {
      return this.zapiszOdpowiedz(m, baza, klient.id, zWatku.id);
    }
    if (klient && !zWatku) {
      return this.zapiszZgloszenie(m, baza, klient.id);
    }
    return this.zapiszDoKolejki(m, baza, {
      powod: dmarcFail ? 'DMARC: adres nadawcy niepotwierdzony' : klient ? 'nadawca nie jest właścicielem zgłoszenia z wątku' : 'nadawca spoza kont klientów',
      userId: klient?.id ?? null,
      sugerowaneZgloszenieId: zWatku?.id ?? null,
    });
  }

  private rodzaj(n: Pick<MailPrzychodzacy, 'doAdresy' | 'naglowki'>, zespol: string): 'SUPPORT' | 'ABUSE' {
    const abuse = `abuse@${zespol}`;
    const adresaci = [...n.doAdresy, ...n.naglowki.filter((h) => ['delivered-to', 'x-original-to'].includes(h.key)).map((h) => h.value.toLowerCase())];
    return adresaci.some((a) => a.includes(abuse)) ? 'ABUSE' : 'SUPPORT';
  }

  /** Konto klienta po adresie nadawcy (subkonto → właściciel konta, jak w panelu). Nieaktywne/usunięte — brak. */
  private async klient(nadawca: string): Promise<{ id: string } | null> {
    if (!nadawca) return null;
    const u = await this.prisma.user.findFirst({
      where: { email: { equals: nadawca, mode: 'insensitive' }, role: 'USER', anonymizedAt: null },
      select: { id: true, customerOwnerId: true },
    });
    if (!u) return null;
    if (!u.customerOwnerId) return { id: u.id };
    const wl = await this.prisma.user.findFirst({ where: { id: u.customerOwnerId, anonymizedAt: null }, select: { id: true } });
    return wl ? { id: wl.id } : null;
  }

  /** Zgłoszenie z nagłówków wątku (pełne id, nasza domena) albo z „[#xxxxxxxx]” w temacie — tylko wśród zgłoszeń klienta. */
  private async zgloszenieZWatku(m: MailPrzychodzacy, domena: string, klientId: string | null): Promise<{ id: string; userId: string } | null> {
    const id = zgloszenieZNaglowkow(m.watek, domena);
    if (id) {
      const t = await this.prisma.ticket.findUnique({ where: { id }, select: { id: true, userId: true } });
      if (t) return t;
    }
    const krotkie = krotkieIdZTematu(m.temat);
    if (krotkie && klientId) {
      const t = await this.prisma.ticket.findMany({ where: { userId: klientId, id: { startsWith: krotkie } }, select: { id: true, userId: true }, take: 2 });
      if (t.length === 1) return t[0];
    }
    return null;
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
          tags: baza.rodzaj === 'ABUSE' ? ['e-mail', 'abuse'] : ['e-mail'],
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

  async lista(q: { widok?: string; page?: string; limit?: string }) {
    const widok = q.widok === 'spam' ? 'spam' : q.widok === 'wszystkie' ? 'wszystkie' : 'kolejka';
    const where: Prisma.PocztaPrzychodzacaWhereInput =
      widok === 'kolejka' ? { wynik: 'BEZ_KLIENTA' } : widok === 'spam' ? { wynik: 'SPAM' } : {};
    const { limit, page, skip } = stronaListy(q, 25, 100);
    const [rows, total, kolejka, spam] = await Promise.all([
      this.prisma.pocztaPrzychodzaca.findMany({ where, orderBy: [{ otrzymano: 'desc' }, { id: 'desc' }], skip, take: limit }),
      this.prisma.pocztaPrzychodzaca.count({ where }),
      this.prisma.pocztaPrzychodzaca.count({ where: { wynik: 'BEZ_KLIENTA' } }),
      this.prisma.pocztaPrzychodzaca.count({ where: { wynik: 'SPAM' } }),
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
  async plik(id: string, nr: number, potwierdzam: boolean, actorUserId: string): Promise<{ stream: Readable; nazwa: string; typ: string }> {
    if (!potwierdzam) {
      throw new BadRequestException('Plik od nieznanego nadawcy, bez skanu antywirusowego — potwierdź „Pokaż”, żeby go pobrać.');
    }
    const w = await this.prisma.pocztaPrzychodzaca.findUnique({ where: { id }, select: { zalaczniki: true, nadawca: true } });
    const z = w ? listaZalacznikow(w.zalaczniki)[nr] : undefined;
    if (!w || !z?.klucz) throw new NotFoundException('Nie ma takiego pliku.');
    await this.audit.record({ action: 'POCZTA_ZGLOSZEN_PLIK_POKAZANY', actorUserId, details: { pocztaId: id, plik: z.nazwa, nadawca: w.nadawca } });
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
   */
  async przypisz(id: string, actorUserId: string, dto: { userId?: string; zgloszenieId?: string }) {
    const w = await this.wKolejce(id);
    if (!dto.userId === !dto.zgloszenieId) throw new BadRequestException('Wskaż klienta albo zgłoszenie.');
    const pliki = listaZalacznikow(w.zalaczniki).filter((z) => z.klucz);
    const opis = `Mail od ${w.nadawcaNazwa ? `${w.nadawcaNazwa} ` : ''}<${w.nadawca}> (${w.otrzymano.toISOString().slice(0, 16).replace('T', ' ')} UTC)`;
    const notatkaPlikow = pliki.length ? ` Załączniki (${pliki.length}): ${pliki.map((p) => p.nazwa).join(', ')} — w „Poczta bez klienta”, za „Pokaż”.` : '';
    let ticketId: string;
    if (dto.userId) {
      const k = await this.prisma.user.findFirst({ where: { id: dto.userId, role: 'USER', anonymizedAt: null }, select: { id: true } });
      if (!k) throw new NotFoundException('Nie znaleziono konta klienta.');
      // Zajęcie wpisu przed utworzeniem zgłoszenia — dwa kliknięcia nie założą dwóch zgłoszeń.
      await this.zajmij(id, w.wynik, actorUserId);
      try {
        ticketId = (
          await this.tickets.create(k.id, { subject: tematZgloszenia(w.temat), message: w.tresc?.trim() || '(pusta wiadomość)', department: 'TECHNICAL' })
        ).id;
      } catch (e) {
        await this.prisma.pocztaPrzychodzaca.update({ where: { id }, data: { wynik: w.wynik, obsluzylId: null, obsluzono: null } });
        throw e;
      }
      await this.tickets.adminAddNote(ticketId, actorUserId, `${opis} — zgłoszenie założone z poczty bez klienta.${notatkaPlikow}`, { zrodlo: 'poczta' });
    } else {
      const t = await this.prisma.ticket.findUnique({ where: { id: dto.zgloszenieId! }, select: { id: true } });
      if (!t) throw new NotFoundException('Nie znaleziono zgłoszenia.');
      await this.zajmij(id, w.wynik, actorUserId);
      ticketId = t.id;
      await this.tickets.adminAddNote(ticketId, actorUserId, `${opis}:\n\n${(w.tresc ?? '').slice(0, 20_000)}${notatkaPlikow}`, { zrodlo: 'poczta' });
    }
    const userId = (await this.prisma.ticket.findUniqueOrThrow({ where: { id: ticketId }, select: { userId: true } })).userId;
    await this.prisma.pocztaPrzychodzaca.update({ where: { id }, data: { ticketId, userId, tresc: null } });
    await this.audit.record({ action: 'POCZTA_ZGLOSZEN_PRZYPISANA', userId, actorUserId, details: { pocztaId: id, ticketId, nadawca: w.nadawca } });
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
  async odrzuc(id: string, actorUserId: string, dto: { powod: string; zablokuj?: boolean }) {
    const powod = dto.powod?.trim() ?? '';
    if (powod.length < 3) throw new BadRequestException('Podaj powód odrzucenia.');
    const w = await this.wKolejce(id);
    const { count } = await this.prisma.pocztaPrzychodzaca.updateMany({
      where: { id, wynik: w.wynik },
      data: { wynik: 'ODRZUCONY', powod: powod.slice(0, 300), tresc: null, obsluzylId: actorUserId, obsluzono: new Date(), zalaczniki: [] },
    });
    if (count !== 1) throw new ConflictException('Tę wiadomość ktoś już obsłużył — odśwież listę.');
    for (const z of listaZalacznikow(w.zalaczniki)) if (z.klucz) await this.usunPlik(z.klucz);
    if (dto.zablokuj && w.nadawca) await this.zablokuj(w.nadawca, `odrzucony mail: ${powod}`, actorUserId);
    await this.audit.record({ action: 'POCZTA_ZGLOSZEN_ODRZUCONA', actorUserId, details: { pocztaId: id, nadawca: w.nadawca, powod, zablokowano: !!dto.zablokuj } });
    return { ok: true as const };
  }

  // ------------------------------------------------------------------ blokady nadawców

  async blokady() {
    return this.prisma.pocztaBlokadaNadawcy.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async zablokuj(wzorzec: string, powod: string | undefined, actorUserId: string) {
    const w = normalizujWzorzec(wzorzec);
    if (!w) throw new BadRequestException('Podaj adres (jan@firma.pl) albo domenę (@firma.pl).');
    if (w.endsWith(`@${CONTROL_PLANE_MAIL_DOMAIN}`) || w === `@${CONTROL_PLANE_MAIL_DOMAIN}`) throw new BadRequestException('Nie blokujemy własnej domeny.');
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

  /** Wpisy bez zgłoszenia starsze niż 90 dni (z plikami w magazynie) — dane obcych nadawców nie leżą bez końca. */
  @Cron('20 4 * * *', { name: 'tickets:poczta-retencja' })
  async retencja(teraz = new Date()): Promise<number> {
    const stare = await this.prisma.pocztaPrzychodzaca.findMany({
      where: { ticketId: null, createdAt: { lt: new Date(teraz.getTime() - RETENCJA_DNI * 86_400_000) } },
      select: { id: true, zalaczniki: true },
      take: 1000,
    });
    for (const w of stare) for (const z of listaZalacznikow(w.zalaczniki)) if (z.klucz) await this.usunPlik(z.klucz);
    if (stare.length) await this.prisma.pocztaPrzychodzaca.deleteMany({ where: { id: { in: stare.map((w) => w.id) } } });
    return stare.length;
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
