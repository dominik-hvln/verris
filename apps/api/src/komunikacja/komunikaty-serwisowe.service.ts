import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { Prisma, type KomunikatSerwisowy } from '@verris/database';
import { KOMUNIKAT_LIMIT_NA_MINUTE, KOMUNIKAT_ODBIORCY_MAX, wypelnijSzablon, type ZakresKomunikatu } from '@verris/contracts';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { SupportActions } from '../common/audit/audit.actions.js';
import { MailerService } from '../mail/mailer.service.js';
import { mailObslugiTemplate } from '../mail/templates/obsluga-notifications.js';
import { adresyWezlow, sprawdzTrescSerwisowa } from './tresc-serwisowa.js';

/** Odbiorca w trakcie wysyłki dłużej niż tyle — proces padł w środku; NIE wysyłamy drugi raz (BLAD). */
export const WYSYLANIE_PRZETERMINOWANE_MS = 15 * 60 * 1000;
const POWOD_MIN = 10;
/** Ten sam komunikat (zakres, cel, temat, treść) w tym oknie — odmowa (zatrzymany można zlecić od razu ponownie). */
export const DUPLIKAT_OKNO_MS = 30 * 60 * 1000;

/** Treść komunikatu: reguły poczty serwisowej; jedyne pole to {imie} (wstawiane przy wysyłce każdemu odbiorcy). */
export function trescKomunikatu(temat: string, tresc: string, adresy: readonly string[] = []): { temat: string; tresc: string } {
  const r = sprawdzTrescSerwisowa(temat, (tresc ?? '').replace(/\{imie\}/g, '§IMIE§'), adresy);
  return { temat: r.temat, tresc: r.tresc.replace(/§IMIE§/g, '{imie}') };
}

export interface ZlecenieKomunikatu {
  zakres: ZakresKomunikatu;
  celId: string;
  temat: string;
  tresc: string;
  powod: string;
}

/**
 * F3.8 (ON-01, ON-05) — komunikat serwisowy do wszystkich klientów węzła albo planu przy incydencie lub pracach
 * (L4: SERVICE_NOTICES_SEND, ADMIN). Poczta serwisowa (TRANSACTIONAL): bez zgody marketingowej, więc bez treści
 * promocyjnych (PKE) i bez nazw infrastruktury. Podgląd odbiorców i treści przed wysyłką; odbiorcy zamrażani przy
 * zleceniu (klient przeniesiony w trakcie incydentu i tak dostanie wiadomość o tym incydencie); wysyłka kolejką
 * KOMUNIKAT_LIMIT_NA_MINUTE maili na minutę, jeden mail na parę komunikat–klient (atomowe przejęcie odbiorcy, więc
 * dwie instancje API nie wyślą dwa razy). Odbiorcy: właściciele (USER, nie zanonimizowani) — węzeł: aktywne konto
 * hostingu na węźle; plan: usługa ACTIVE albo PAST_DUE w planie.
 */
@Injectable()
export class KomunikatySerwisoweService {
  private readonly logger = new Logger(KomunikatySerwisoweService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {}

  private warunekOdbiorcow(zakres: ZakresKomunikatu, celId: string): Prisma.UserWhereInput {
    const zywy: Prisma.UserWhereInput = { role: 'USER', anonymizedAt: null };
    if (zakres === 'WEZEL') return { ...zywy, accounts: { some: { serverId: celId, status: 'ACTIVE' } } };
    return { ...zywy, subscriptions: { some: { planId: celId, status: { in: ['ACTIVE', 'PAST_DUE'] } } } };
  }

  private async cel(zakres: ZakresKomunikatu, celId: string): Promise<{ id: string; nazwa: string }> {
    if (zakres === 'WEZEL') {
      const s = await this.prisma.server.findUnique({ where: { id: celId }, select: { id: true, name: true, hostname: true, ipAddress: true } });
      if (!s) throw new NotFoundException('Nie znaleziono węzła.');
      return { id: s.id, nazwa: s.name ?? s.hostname ?? s.ipAddress ?? s.id };
    }
    if (zakres === 'PLAN') {
      const p = await this.prisma.plan.findUnique({ where: { id: celId }, select: { id: true, name: true } });
      if (!p) throw new NotFoundException('Nie znaleziono planu.');
      return { id: p.id, nazwa: p.name };
    }
    throw new BadRequestException('Zakres: węzeł albo plan.');
  }

  async podglad(z: Omit<ZlecenieKomunikatu, 'powod'>) {
    const cel = await this.cel(z.zakres, z.celId);
    const { temat, tresc } = trescKomunikatu(z.temat, z.tresc, await adresyWezlow(this.prisma));
    const where = this.warunekOdbiorcow(z.zakres, z.celId);
    const [odbiorcow, przyklad] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({ where, orderBy: { email: 'asc' }, take: 20, select: { id: true, email: true, firstName: true, lastName: true, companyName: true } }),
    ]);
    const mail = mailObslugiTemplate({ to: 'klient@example.com', userId: 'podglad', temat, tresc: wypelnijSzablon(tresc, { imie: null }), panelUrl: this.panelUrl(), tag: 'obsluga.komunikat' });
    return {
      zakres: z.zakres,
      cel,
      odbiorcow,
      przekroczono: odbiorcow > KOMUNIKAT_ODBIORCY_MAX,
      przyklad: przyklad.map((u) => ({ id: u.id, email: u.email, nazwa: u.companyName || [u.firstName, u.lastName].filter(Boolean).join(' ') || null })),
      temat,
      podgladTekst: mail.text,
      minutWysylki: Math.ceil(odbiorcow / KOMUNIKAT_LIMIT_NA_MINUTE),
    };
  }

  async zlec(z: ZlecenieKomunikatu, operatorUserId: string) {
    const powod = (z.powod ?? '').trim();
    if (powod.length < POWOD_MIN) throw new BadRequestException(`Podaj powód (min. ${POWOD_MIN} znaków) — zapisze się w dzienniku.`);
    const cel = await this.cel(z.zakres, z.celId);
    const { temat, tresc } = trescKomunikatu(z.temat, z.tresc, await adresyWezlow(this.prisma));
    const odbiorcy = await this.prisma.user.findMany({ where: this.warunekOdbiorcow(z.zakres, z.celId), select: { id: true }, take: KOMUNIKAT_ODBIORCY_MAX + 1 });
    if (!odbiorcy.length) throw new BadRequestException('Brak odbiorców — nikt nie ma aktywnej usługi w tym zakresie.');
    if (odbiorcy.length > KOMUNIKAT_ODBIORCY_MAX) throw new BadRequestException(`Za dużo odbiorców (ponad ${KOMUNIKAT_ODBIORCY_MAX}) — podziel zakres.`);
    const k = await this.prisma.$transaction(async (tx) => {
      // Przegląd F3.8 — podwójne kliknięcie, ponowienie po przekroczeniu czasu albo dwie karty nie mogą wysłać tego samego
      // komunikatu dwa razy do tysięcy klientów: blokada na zakres i cel, potem sprawdzenie świeżego duplikatu.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`komunikat-serwisowy:${z.zakres}:${cel.id}`}))`;
      const duplikat = await tx.komunikatSerwisowy.findFirst({
        where: {
          zakres: z.zakres,
          ...(z.zakres === 'WEZEL' ? { serverId: cel.id } : { planId: cel.id }),
          temat,
          tresc,
          status: { in: ['WYSYLANY', 'WYSLANY'] },
          createdAt: { gte: new Date(Date.now() - DUPLIKAT_OKNO_MS) },
        },
        select: { id: true },
      });
      if (duplikat) {
        throw new ConflictException('Ten sam komunikat do tego zakresu został już zlecony przed chwilą — sprawdź listę komunikatów.');
      }
      const k = await tx.komunikatSerwisowy.create({
        data: {
          zakres: z.zakres,
          serverId: z.zakres === 'WEZEL' ? cel.id : null,
          planId: z.zakres === 'PLAN' ? cel.id : null,
          temat,
          tresc,
          powod: powod.slice(0, 500),
          odbiorcow: odbiorcy.length,
          utworzylId: operatorUserId,
        },
      });
      await tx.komunikatSerwisowyOdbiorca.createMany({ data: odbiorcy.map((o) => ({ komunikatId: k.id, userId: o.id })), skipDuplicates: true });
      return k;
    });
    await this.audit.record({
      action: SupportActions.SERVICE_NOTICE_QUEUED,
      actorUserId: operatorUserId,
      details: { komunikatId: k.id, zakres: z.zakres, celId: cel.id, cel: cel.nazwa, odbiorcow: odbiorcy.length, temat, powod },
    });
    return this.widok(k.id);
  }

  async zatrzymaj(id: string, operatorUserId: string) {
    const { count } = await this.prisma.komunikatSerwisowy.updateMany({ where: { id, status: 'WYSYLANY' }, data: { status: 'ZATRZYMANY', zakonczono: new Date() } });
    if (count === 0) {
      if (!(await this.prisma.komunikatSerwisowy.findUnique({ where: { id }, select: { id: true } }))) throw new NotFoundException('Komunikat nie istnieje.');
      throw new ConflictException('Komunikat nie jest już wysyłany.');
    }
    const pominieci = await this.prisma.komunikatSerwisowyOdbiorca.updateMany({ where: { komunikatId: id, status: 'CZEKA' }, data: { status: 'POMINIETY', zmieniono: new Date() } });
    await this.prisma.komunikatSerwisowy.update({ where: { id }, data: { pominieto: { increment: pominieci.count } } });
    await this.audit.record({ action: SupportActions.SERVICE_NOTICE_STOPPED, actorUserId: operatorUserId, details: { komunikatId: id, niewyslanych: pominieci.count } });
    return this.widok(id);
  }

  async lista() {
    const rows = await this.prisma.komunikatSerwisowy.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
    return Promise.all(rows.map((r) => this.zCelem(r)));
  }

  async widok(id: string) {
    const r = await this.prisma.komunikatSerwisowy.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Komunikat nie istnieje.');
    return this.zCelem(r);
  }

  private async zCelem(r: KomunikatSerwisowy) {
    const [cel, autor] = await Promise.all([
      this.cel(r.zakres as ZakresKomunikatu, (r.serverId ?? r.planId)!).catch(() => ({ id: r.serverId ?? r.planId, nazwa: '(usunięty)' })),
      r.utworzylId ? this.prisma.user.findUnique({ where: { id: r.utworzylId }, select: { email: true, firstName: true, lastName: true } }) : null,
    ]);
    return {
      id: r.id,
      zakres: r.zakres,
      cel,
      temat: r.temat,
      tresc: r.tresc,
      powod: r.powod,
      status: r.status,
      odbiorcow: r.odbiorcow,
      wyslano: r.wyslano,
      bledow: r.bledow,
      pominieto: r.pominieto,
      autor: autor ? [autor.firstName, autor.lastName].filter(Boolean).join(' ') || autor.email : null,
      utworzono: r.createdAt.toISOString(),
      zakonczono: r.zakonczono?.toISOString() ?? null,
    };
  }

  private panelUrl() {
    return this.config.get<string>('CLIENT_PANEL_URL') ?? 'https://panel.verris.pl';
  }

  /** Kolejka: co minutę najwyżej KOMUNIKAT_LIMIT_NA_MINUTE maili ze wszystkich wysyłanych komunikatów (najstarszy pierwszy). */
  @Cron('* * * * *', { name: 'komunikaty-serwisowe:wysylka' })
  async wysylka(): Promise<void> {
    // Bez argumentów: biblioteka cron woła zadanie z własnym parametrem (onComplete), który nie może trafić do limitu.
    await this.wyslijPaczke(KOMUNIKAT_LIMIT_NA_MINUTE);
  }

  async wyslijPaczke(limit: number): Promise<{ wyslano: number }> {
    // Proces padł w trakcie wysyłki do odbiorcy — nie wiemy, czy mail wyszedł: BLAD (bez drugiej wysyłki).
    const przeterminowane = await this.prisma.komunikatSerwisowyOdbiorca.findMany({
      where: { status: 'WYSYLANIE', zmieniono: { lt: new Date(Date.now() - WYSYLANIE_PRZETERMINOWANE_MS) } },
      select: { id: true, komunikatId: true },
    });
    for (const o of przeterminowane) {
      const { count } = await this.prisma.komunikatSerwisowyOdbiorca.updateMany({ where: { id: o.id, status: 'WYSYLANIE' }, data: { status: 'BLAD', zmieniono: new Date() } });
      if (count) await this.prisma.komunikatSerwisowy.update({ where: { id: o.komunikatId }, data: { bledow: { increment: 1 } } });
    }

    let wyslano = 0;
    const komunikaty = await this.prisma.komunikatSerwisowy.findMany({ where: { status: 'WYSYLANY' }, orderBy: { createdAt: 'asc' }, take: 10 });
    for (const k of komunikaty) {
      if (wyslano >= limit) break;
      const czekajacy = await this.prisma.komunikatSerwisowyOdbiorca.findMany({
        where: { komunikatId: k.id, status: 'CZEKA' },
        orderBy: { userId: 'asc' },
        take: limit - wyslano,
        select: { id: true, userId: true },
      });
      for (const o of czekajacy) {
        // Atomowe przejęcie — druga instancja API nie wyśle tego samego maila.
        const { count } = await this.prisma.komunikatSerwisowyOdbiorca.updateMany({ where: { id: o.id, status: 'CZEKA' }, data: { status: 'WYSYLANIE', zmieniono: new Date() } });
        if (!count) continue;
        wyslano++;
        const wynik = await this.wyslijJednemu(k, o.userId);
        await this.prisma.komunikatSerwisowyOdbiorca.update({ where: { id: o.id }, data: { status: wynik.status, emailLogId: wynik.emailLogId, zmieniono: new Date() } });
        await this.prisma.komunikatSerwisowy.update({
          where: { id: k.id },
          data: wynik.status === 'WYSLANY' ? { wyslano: { increment: 1 } } : wynik.status === 'POMINIETY' ? { pominieto: { increment: 1 } } : { bledow: { increment: 1 } },
        });
      }
      const zostalo = await this.prisma.komunikatSerwisowyOdbiorca.count({ where: { komunikatId: k.id, status: { in: ['CZEKA', 'WYSYLANIE'] } } });
      if (!zostalo) await this.prisma.komunikatSerwisowy.updateMany({ where: { id: k.id, status: 'WYSYLANY' }, data: { status: 'WYSLANY', zakonczono: new Date() } });
    }
    return { wyslano };
  }

  private async wyslijJednemu(k: { id: string; temat: string; tresc: string }, userId: string): Promise<{ status: 'WYSLANY' | 'BLAD' | 'POMINIETY'; emailLogId: string | null }> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true, firstName: true, anonymizedAt: true } });
    if (!u || u.anonymizedAt) return { status: 'POMINIETY', emailLogId: null };
    try {
      const r = await this.mailer.send(
        mailObslugiTemplate({
          to: u.email,
          userId,
          temat: k.temat,
          tresc: wypelnijSzablon(k.tresc, { imie: u.firstName }),
          panelUrl: this.panelUrl(),
          tag: `obsluga.komunikat.${k.id.slice(0, 8)}`,
        }),
      );
      return { status: r.delivered ? 'WYSLANY' : r.suppressedReason ? 'POMINIETY' : 'BLAD', emailLogId: r.emailLogId };
    } catch (e) {
      this.logger.error(`Komunikat ${k.id} do ${userId}: ${e instanceof Error ? e.message : String(e)}`);
      return { status: 'BLAD', emailLogId: null };
    }
  }
}
