import { BadRequestException, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mail/mailer.service';
import { AuditService } from '../common/audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AiService } from '../ai/ai.service';
import { ticketAutoMessageTemplate } from '../mail/templates/ticket-notifications';

/**
 * PB-37 — opieka nad zgłoszeniem (decyzja właściciela 2026-09-26).
 *
 * Klient nigdy nie zastanawia się, czy wiadomość do nas trafiła: cztery automatyczne wiadomości
 * (e-mail + wpis w wątku, treści edytowalne w panelu admina), „przeczytane” przy zgłoszeniu i ocena
 * opiekuna oraz supportu po zamknięciu. Agent dostaje gotowy szkic asystenta, zanim otworzy zgłoszenie.
 * Automatyczne wiadomości NIE liczą się jako odpowiedź (SLA, status, „czeka na klienta” bez zmian).
 */
export const RODZAJE_AUTO = ['POTWIERDZENIE', 'ZAJMUJE_SIE', 'WCIAZ_PRACUJEMY', 'PODZIEKOWANIE'] as const;
export type RodzajAuto = (typeof RODZAJE_AUTO)[number];

export const ZMIENNE_AUTO = ['nr', 'temat', 'opiekun', 'termin', 'imie', 'link'] as const;

export interface UstawienieAuto {
  wlaczone: boolean;
  tresc: string;
}

export const DOMYSLNE_AUTO: Record<RodzajAuto, UstawienieAuto & { nazwa: string; kiedy: string; tytul: string }> = {
  POTWIERDZENIE: {
    nazwa: 'Potwierdzenie z opiekunem',
    kiedy: 'Od razu po utworzeniu zgłoszenia.',
    tytul: 'Otrzymaliśmy Twoje zgłoszenie',
    wlaczone: true,
    tresc:
      'Dzień dobry, otrzymaliśmy zgłoszenie #{{nr}} „{{temat}}”. Zajmie się nim {{opiekun}} — odpowiemy najpóźniej {{termin}}. O każdej zmianie napiszemy e-mailem, nie musisz sprawdzać panelu.',
  },
  ZAJMUJE_SIE: {
    nazwa: '„Opiekun się tym zajmuje”',
    kiedy: 'Gdy opiekun pierwszy raz otworzy zgłoszenie albo zmieni stan na „W realizacji”.',
    tytul: 'Zajmujemy się Twoim zgłoszeniem',
    wlaczone: true,
    tresc: '{{opiekun}} przeczytał(a) zgłoszenie #{{nr}} i już nad nim pracuje. Odezwiemy się najpóźniej {{termin}}.',
  },
  WCIAZ_PRACUJEMY: {
    nazwa: '„Wciąż nad tym pracujemy”',
    kiedy: 'Gdy zgłoszenie czeka na nas dłużej niż połowa czasu odpowiedzi — najwyżej raz na dobę.',
    tytul: 'Wciąż pracujemy nad Twoim zgłoszeniem',
    wlaczone: true,
    tresc:
      'Wciąż pracujemy nad zgłoszeniem #{{nr}} „{{temat}}”. Sprawa wymaga trochę więcej czasu — {{opiekun}} odezwie się, gdy tylko będzie coś nowego. Nie musisz nic robić.',
  },
  PODZIEKOWANIE: {
    nazwa: 'Podziękowanie + ocena',
    kiedy: 'Po oznaczeniu zgłoszenia jako rozwiązane.',
    tytul: 'Dziękujemy za kontakt',
    wlaczone: true,
    tresc:
      'Dziękujemy za kontakt! Zgłoszenie #{{nr}} oznaczyliśmy jako rozwiązane. Oceń proszę pomoc ({{opiekun}} i obsługę ogólnie) — to zajmie 10 sekund: {{link}}. Jeśli coś jest nie tak, otworzysz zgłoszenie ponownie jednym kliknięciem.',
  },
};

const KLUCZ = 'support.autoWiadomosci';
const DOBA_MS = 24 * 60 * 60 * 1000;
const REOPEN_DNI = 7;

/** Godziny na pierwszą odpowiedź wg priorytetu (to samo co SLA przy tworzeniu zgłoszenia). */
export function godzinySla(priority: string): number {
  return priority === 'URGENT' ? 1 : priority === 'HIGH' ? 4 : priority === 'NORMAL' ? 12 : 24;
}

const fmt = new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit' });
const fmtDzien = new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', day: '2-digit', month: '2-digit' });

export function terminSlownie(d: Date | null | undefined, teraz = new Date()): string {
  if (!d) return 'jak najszybciej';
  const dzien = fmtDzien.format(d);
  return dzien === fmtDzien.format(teraz) ? `dziś do ${fmt.format(d)}` : `${dzien} do ${fmt.format(d)}`;
}

export function opiekunSlownie(u: { firstName: string | null; lastName: string | null } | null | undefined): string {
  if (!u?.firstName) return 'nasz zespół';
  return u.lastName ? `${u.firstName} ${u.lastName.charAt(0)}.` : u.firstName;
}

@Injectable()
export class OpiekaZgloszenService {
  private readonly logger = new Logger(OpiekaZgloszenService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    @Optional() private readonly ai?: AiService,
  ) {}

  private panelUrl(): string {
    return (this.config.get<string>('clientPanelUrl') ?? 'http://localhost:3001').replace(/\/$/, '');
  }

  // ---------------------------------------------------------------- ustawienia (panel admina)

  async ustawienia(): Promise<Record<RodzajAuto, UstawienieAuto>> {
    const w = await this.prisma.platformSetting.findUnique({ where: { key: KLUCZ } });
    let zapis: Partial<Record<RodzajAuto, Partial<UstawienieAuto>>> = {};
    try {
      zapis = w?.value ? JSON.parse(w.value) : {};
    } catch {
      /* uszkodzony zapis → domyślne */
    }
    return Object.fromEntries(
      RODZAJE_AUTO.map((r) => [
        r,
        { wlaczone: zapis[r]?.wlaczone ?? DOMYSLNE_AUTO[r].wlaczone, tresc: zapis[r]?.tresc || DOMYSLNE_AUTO[r].tresc },
      ]),
    ) as Record<RodzajAuto, UstawienieAuto>;
  }

  async widokUstawien() {
    const u = await this.ustawienia();
    return {
      zmienne: ZMIENNE_AUTO,
      wiadomosci: RODZAJE_AUTO.map((r) => ({
        rodzaj: r,
        nazwa: DOMYSLNE_AUTO[r].nazwa,
        kiedy: DOMYSLNE_AUTO[r].kiedy,
        domyslna: DOMYSLNE_AUTO[r].tresc,
        ...u[r],
      })),
    };
  }

  async zapiszUstawienia(zmiany: Partial<Record<RodzajAuto, UstawienieAuto>>, actorUserId: string) {
    const obecne = await this.ustawienia();
    for (const [r, v] of Object.entries(zmiany)) {
      if (!RODZAJE_AUTO.includes(r as RodzajAuto)) throw new BadRequestException(`Nieznana wiadomość: ${r}`);
      const tresc = (v?.tresc ?? '').trim();
      if (tresc.length < 10 || tresc.length > 2000) throw new BadRequestException('Treść: od 10 do 2000 znaków.');
      const obce = [...tresc.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)].map((m) => m[1]).filter((z) => !ZMIENNE_AUTO.includes(z as never));
      if (obce.length) throw new BadRequestException(`Nieznane zmienne: ${obce.map((z) => `{{${z}}}`).join(', ')}`);
      obecne[r as RodzajAuto] = { wlaczone: !!v?.wlaczone, tresc };
    }
    await this.prisma.platformSetting.upsert({
      where: { key: KLUCZ },
      create: { key: KLUCZ, value: JSON.stringify(obecne), updatedByUserId: actorUserId },
      update: { value: JSON.stringify(obecne), updatedByUserId: actorUserId },
    });
    await this.audit.record({ action: 'SUPPORT_AUTO_MESSAGES_UPDATED', actorUserId, details: { rodzaje: Object.keys(zmiany) } });
    return this.widokUstawien();
  }

  // ---------------------------------------------------------------- wysyłka

  /**
   * Wysyła automatyczną wiadomość (wpis w wątku + e-mail). Zwraca false, gdy wyłączona w panelu
   * albo (POTWIERDZENIE, ZAJMUJE_SIE) już wysłana przy tym zgłoszeniu.
   */
  async wyslij(ticketId: string, rodzaj: RodzajAuto): Promise<boolean> {
    const u = (await this.ustawienia())[rodzaj];
    if (!u.wlaczone) return false;
    const t = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        user: { select: { email: true, firstName: true, anonymizedAt: true } },
        assignedTo: { select: { firstName: true, lastName: true } },
      },
    });
    if (!t) return false;
    if (rodzaj === 'POTWIERDZENIE' || rodzaj === 'ZAJMUJE_SIE') {
      const juz = await this.prisma.ticketReply.count({ where: { ticketId, automatic: rodzaj } });
      if (juz) return false;
    }
    const link = `${this.panelUrl()}/dashboard/support/${t.id}${rodzaj === 'PODZIEKOWANIE' ? '#ocena' : ''}`;
    const wartosci: Record<(typeof ZMIENNE_AUTO)[number], string> = {
      nr: t.id.slice(0, 8),
      temat: t.subject,
      opiekun: opiekunSlownie(t.assignedTo),
      termin: terminSlownie(t.slaResponseDueAt && t.slaResponseDueAt > new Date() ? t.slaResponseDueAt : null),
      imie: t.user.firstName ? ` ${t.user.firstName}` : '',
      link,
    };
    const tresc = u.tresc.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (m, k: string) => wartosci[k as keyof typeof wartosci] ?? m);

    await this.prisma.ticketReply.create({
      data: { ticketId, message: tresc, isStaff: true, automatic: rodzaj, authorId: t.assignedToId ?? t.userId },
    });
    await this.prisma.ticketEvent
      .create({ data: { ticketId, type: 'AUTO_MESSAGE', meta: { rodzaj } } })
      .catch(() => undefined);
    if (t.user.email && !t.user.anonymizedAt) {
      void this.mailer
        .send({
          ...ticketAutoMessageTemplate({
            ticketId: t.id,
            subject: t.subject,
            customerEmail: t.user.email,
            panelUrl: this.panelUrl(),
            tytul: DOMYSLNE_AUTO[rodzaj].tytul,
            tresc,
            ocena: rodzaj === 'PODZIEKOWANIE',
          }),
          category: 'TRANSACTIONAL',
          fromRole: 'SUPPORT',
        })
        .catch(() => undefined);
    }
    return true;
  }

  /** Otwarcie zgłoszenia w obsłudze: przypisany opiekun → „przeczytane”, za pierwszym razem „zajmuje się”. */
  async otwartePrzezObsluge(ticketId: string, actorUserId: string | undefined): Promise<void> {
    if (!actorUserId) return;
    const t = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { assignedToId: true, status: true, firstResponseAt: true },
    });
    if (!t || t.assignedToId !== actorUserId || t.status === 'CLOSED') return;
    await this.prisma.ticket.update({ where: { id: ticketId }, data: { staffReadAt: new Date() } });
    if (!t.firstResponseAt) await this.wyslij(ticketId, 'ZAJMUJE_SIE');
  }

  /**
   * Co 5 minut: zgłoszenia czekające na nas dłużej niż połowa czasu odpowiedzi → klient dostaje
   * „Wciąż nad tym pracujemy”, opiekun przypomnienie. Najwyżej raz na dobę na zgłoszenie.
   */
  async wciazPracujemy(teraz = new Date()): Promise<number> {
    const kandydaci = await this.prisma.ticket.findMany({
      where: {
        status: { in: ['OPEN', 'IN_PROGRESS'] },
        OR: [{ lastReplyIsStaff: null }, { lastReplyIsStaff: false }],
        AND: [{ OR: [{ progressNoticeAt: null }, { progressNoticeAt: { lt: new Date(teraz.getTime() - DOBA_MS) } }] }],
        createdAt: { lt: new Date(teraz.getTime() - (godzinySla('URGENT') / 2) * 3600_000) },
      },
      select: { id: true, subject: true, priority: true, lastReplyAt: true, createdAt: true, assignedToId: true },
      take: 200,
    });
    let wyslane = 0;
    for (const t of kandydaci) {
      const od = t.lastReplyAt ?? t.createdAt;
      if (teraz.getTime() - od.getTime() < (godzinySla(t.priority) / 2) * 3600_000) continue;
      await this.prisma.ticket.update({ where: { id: t.id }, data: { progressNoticeAt: teraz } });
      if (!(await this.wyslij(t.id, 'WCIAZ_PRACUJEMY'))) continue;
      wyslane += 1;
      if (t.assignedToId) {
        await this.notifications.create({
          userId: t.assignedToId,
          category: 'SUPPORT',
          severity: 'warning',
          title: 'Klient czeka na odpowiedź',
          body: `#${t.id.slice(0, 8)} — ${t.subject}. Wysłaliśmy „Wciąż nad tym pracujemy”.`,
          link: `/tickets/${t.id}`,
        });
      }
    }
    return wyslane;
  }

  // ---------------------------------------------------------------- szkic asystenta

  /** Szkic odpowiedzi w tle (po utworzeniu i po każdej wiadomości klienta) — gotowy, zanim agent otworzy. */
  async przygotujSzkic(ticketId: string): Promise<void> {
    if (!this.ai) return;
    const t = await this.prisma.ticket.findUnique({ where: { id: ticketId }, select: { assignedToId: true, status: true } });
    if (!t?.assignedToId || t.status === 'CLOSED') return;
    try {
      const wynik = await this.ai.supportSuggestion(ticketId, t.assignedToId);
      await this.prisma.ticket.update({
        where: { id: ticketId },
        data: { aiDraft: typeof wynik === 'string' ? wynik : JSON.stringify(wynik), aiDraftAt: new Date() },
      });
    } catch (e) {
      this.logger.warn(`Szkic asystenta dla ${ticketId.slice(0, 8)} niedostępny: ${(e as Error).message}`);
    }
  }

  // ---------------------------------------------------------------- klient: ponowne otwarcie

  async otworzPonownie(ticketId: string, userId: string) {
    const t = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!t || t.userId !== userId) throw new BadRequestException('Zgłoszenie nie istnieje.');
    if (t.status !== 'CLOSED') throw new BadRequestException('Zgłoszenie jest otwarte.');
    const zamkniete = t.resolvedAt ?? t.autoClosedAt ?? t.updatedAt;
    if (Date.now() - zamkniete.getTime() > REOPEN_DNI * DOBA_MS) {
      throw new BadRequestException(`Minęło ${REOPEN_DNI} dni od zamknięcia — utwórz nowe zgłoszenie.`);
    }
    await this.prisma.ticket.update({
      where: { id: ticketId },
      data: { status: 'OPEN', resolvedAt: null, autoClosedAt: null, waitingSince: null, lastReplyAt: new Date(), lastReplyIsStaff: false },
    });
    await this.prisma.ticketEvent.create({ data: { ticketId, type: 'REOPENED', actorId: userId } }).catch(() => undefined);
    if (t.assignedToId) {
      await this.notifications.create({
        userId: t.assignedToId,
        category: 'SUPPORT',
        severity: 'warning',
        title: 'Klient otworzył zgłoszenie ponownie',
        body: `#${t.id.slice(0, 8)} — ${t.subject}`,
        link: `/tickets/${t.id}`,
      });
    }
    return { ok: true as const };
  }

  // ---------------------------------------------------------------- oceny

  /** Średnie ocen na opiekuna (ostatnie `dni`). `agentId` — tylko jedna osoba (widok obsługi). */
  async ocenyAgentow(dni = 30, agentId?: string) {
    const od = new Date(Date.now() - dni * DOBA_MS);
    const rows = await this.prisma.ticket.findMany({
      where: { csatAt: { gte: od }, csatAgentId: agentId ?? { not: null } },
      select: { csatAgentId: true, csatRating: true, agentRating: true, csatResolved: true },
    });
    const grupy = new Map<string, typeof rows>();
    for (const r of rows) grupy.set(r.csatAgentId!, [...(grupy.get(r.csatAgentId!) ?? []), r]);
    const ludzie = await this.prisma.user.findMany({
      where: { id: { in: [...grupy.keys()] } },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    const sr = (xs: (number | null)[]) => {
      const v = xs.filter((x): x is number => x != null);
      return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
    };
    return [...grupy.entries()]
      .map(([id, g]) => {
        const u = ludzie.find((l) => l.id === id);
        const odp = g.filter((x) => x.csatResolved != null);
        return {
          agentId: id,
          nazwa: u ? [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email : id,
          ocen: g.length,
          opiekun: sr(g.map((x) => x.agentRating)),
          support: sr(g.map((x) => x.csatRating)),
          rozwiazanePct: odp.length ? Math.round((odp.filter((x) => x.csatResolved).length / odp.length) * 100) : null,
        };
      })
      .sort((a, b) => (b.opiekun ?? 0) - (a.opiekun ?? 0));
  }
}
