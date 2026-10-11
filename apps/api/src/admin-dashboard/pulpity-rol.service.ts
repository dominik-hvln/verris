import { Injectable, Optional } from '@nestjs/common';
import { Role } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { RODZAJ_DOKUMENT_ROZLICZENIOWY } from '../billing/tryb-fakturowania.js';
import { RozliczeniaOperatoraService } from '../billing/rozliczenia-operatora.service.js';
import { warunekKontaBezSwiezejKopii } from '../servers/kopie-kont.js';
import { przekroczeniaZBazy } from '../servers/przekroczenia-limitow.js';
import { uslugiNieDzialajaceFloty } from '../servers/uslugi-wezla.js';
import { flotaZBazy, nazwaWezla, uwagaWezlow, SYGNAL_MAX_MIN } from './stan-platformy.js';

/** Termin SLA „zagrożony”, gdy mija w ciągu tylu minut. */
export const SLA_ZAGROZONE_MIN = 120;
const LISTA = 10;

type Zgl = {
  id: string;
  subject: string;
  status: string;
  priority: string;
  firstResponseAt: Date | null;
  slaResponseDueAt: Date | null;
  slaResolveDueAt: Date | null;
  user: { email: string; firstName: string | null; lastName: string | null; companyName: string | null } | null;
};

/**
 * Najbliższy termin zgłoszenia i stan: pierwsza odpowiedź (dopóki jej nie ma), potem rozwiązanie. Czekające na klienta
 * nie mają biegnącego terminu rozwiązania (zegar stoi po stronie klienta).
 */
export function terminZgloszenia(t: Pick<Zgl, 'status' | 'firstResponseAt' | 'slaResponseDueAt' | 'slaResolveDueAt'>, teraz: number) {
  const termin = !t.firstResponseAt ? t.slaResponseDueAt : t.status === 'WAITING_CUSTOMER' ? null : t.slaResolveDueAt;
  const rodzaj: 'odpowiedz' | 'rozwiazanie' | null = !termin ? null : !t.firstResponseAt ? 'odpowiedz' : 'rozwiazanie';
  const ms = termin ? termin.getTime() - teraz : null;
  const stan: 'po-terminie' | 'zagrozone' | 'w-terminie' | 'brak' = ms === null ? 'brak' : ms < 0 ? 'po-terminie' : ms <= SLA_ZAGROZONE_MIN * 60_000 ? 'zagrozone' : 'w-terminie';
  return { termin: termin?.toISOString() ?? null, rodzaj, stan };
}

/**
 * F3.9 (OP-07) — pulpity per rola z istniejących danych: obsługa (moje zgłoszenia i SLA, kolejka), NOC (flota, alerty,
 * kolejki, kopie, przekroczenia), finanse (nieudane płatności, KSeF, do zaksięgowania). Pulpit admina bez zmian
 * (admin/dashboard/overview). Każdy pulpit pod uprawnieniem odczytu swojej dziedziny — panel wybiera, które pokazać.
 */
@Injectable()
export class PulpityRolService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly rozliczenia?: RozliczeniaOperatoraService,
  ) {}

  async obsluga(operatorUserId: string, teraz = Date.now()) {
    const otwarte = { status: { not: 'CLOSED' }, scalonoDoId: null };
    const wybor = {
      id: true,
      subject: true,
      status: true,
      priority: true,
      firstResponseAt: true,
      slaResponseDueAt: true,
      slaResolveDueAt: true,
      user: { select: { email: true, firstName: true, lastName: true, companyName: true } },
    } as const;
    const [moje, nieprzypisane] = await Promise.all([
      this.prisma.ticket.findMany({ where: { ...otwarte, assignedToId: operatorUserId }, select: wybor, take: 500 }),
      this.prisma.ticket.findMany({ where: { ...otwarte, assignedToId: null, status: { notIn: ['CLOSED', 'WAITING_CUSTOMER'] } }, select: wybor, take: 500 }),
    ]);
    const zTerminem = (lista: Zgl[]) =>
      lista
        .map((t) => ({ t, ...terminZgloszenia(t, teraz) }))
        .sort((a, b) => (a.termin ?? '9999').localeCompare(b.termin ?? '9999'));
    const wiersz = (x: ReturnType<typeof zTerminem>[number]) => ({
      id: x.t.id,
      temat: x.t.subject,
      status: x.t.status,
      priorytet: x.t.priority,
      klient: x.t.user ? x.t.user.companyName || [x.t.user.firstName, x.t.user.lastName].filter(Boolean).join(' ') || x.t.user.email : null,
      termin: x.termin,
      rodzajTerminu: x.rodzaj,
      stan: x.stan,
    });
    const m = zTerminem(moje);
    const n = zTerminem(nieprzypisane);
    const ile = (l: typeof m, s: string) => l.filter((x) => x.stan === s).length;
    return {
      moje: {
        otwarte: m.length,
        poTerminie: ile(m, 'po-terminie'),
        zagrozone: ile(m, 'zagrozone'),
        czekaNaKlienta: m.filter((x) => x.t.status === 'WAITING_CUSTOMER').length,
        lista: m.slice(0, LISTA).map(wiersz),
      },
      kolejka: {
        nieprzypisane: n.length,
        poTerminie: ile(n, 'po-terminie'),
        pilne: n.filter((x) => x.t.priority === 'URGENT' || x.t.priority === 'HIGH').length,
        lista: n.slice(0, 5).map(wiersz),
      },
    };
  }

  async noc(teraz = Date.now()) {
    const doba = new Date(teraz - 24 * 3600_000);
    const [{ wezly }, watchdog, incydenty, zakladane, zadaniaBledy, zadaniaWToku, bezKopii, przekroczenia] = await Promise.all([
      flotaZBazy(this.prisma, teraz),
      this.prisma.server.findMany({ where: { status: 'ACTIVE', uslugiStanAt: { not: null } }, select: { id: true, name: true, status: true, uslugiStan: true, uslugiStanAt: true } }),
      this.prisma.probeIncident.findMany({
        where: { status: 'OPEN' },
        orderBy: { startedAt: 'asc' },
        take: LISTA,
        select: { id: true, title: true, severity: true, startedAt: true, probe: { select: { server: { select: { id: true, name: true } } } } },
      }),
      this.prisma.subscription.count({ where: { status: 'PROVISIONING' } }),
      this.prisma.nodeTask.findMany({
        where: { status: 'FAILED', completedAt: { gte: doba } },
        orderBy: { completedAt: 'desc' },
        take: 200,
        select: { id: true, kind: true, completedAt: true, errorMessage: true, server: { select: { id: true, name: true, hostname: true, ipAddress: true } } },
      }),
      this.prisma.nodeTask.count({ where: { status: { in: ['QUEUED', 'RUNNING'] } } }),
      this.prisma.account.count({ where: warunekKontaBezSwiezejKopii(teraz) }),
      przekroczeniaZBazy(this.prisma, undefined, teraz),
    ]);
    const aktywne = wezly.filter((w) => w.status === 'ACTIVE');
    const nieDzialaja = uslugiNieDzialajaceFloty(watchdog, teraz);
    const zFaultami = przekroczenia.wiersze.filter((w) => w.razemDoba > 0).sort((a, b) => b.razemDoba - a.razemDoba);
    return {
      flota: {
        aktywne: aktywne.length,
        serwis: wezly.filter((w) => w.status === 'MAINTENANCE').length,
        offline: wezly.filter((w) => w.status === 'OFFLINE').length,
        bezSygnalu: aktywne.filter((w) => !w.lastHeartbeatAt || teraz - w.lastHeartbeatAt.getTime() > SYGNAL_MAX_MIN * 60_000).length,
        przyjmujaKonta: aktywne.filter((w) => w.acceptsNewAccounts).length,
        uwaga: uwagaWezlow(wezly, teraz).slice(0, LISTA),
      },
      alerty: {
        uslugi: nieDzialaja,
        incydenty: incydenty.map((i) => ({
          id: i.id,
          tytul: i.title,
          powazny: i.severity === 'MAJOR',
          od: i.startedAt.toISOString(),
          wezel: i.probe.server ? { id: i.probe.server.id, nazwa: i.probe.server.name ?? i.probe.server.id } : null,
        })),
      },
      kolejki: {
        zakladane,
        zadaniaWToku,
        zadaniaBledyDoba: zadaniaBledy.length,
        bledy: zadaniaBledy.slice(0, 5).map((z) => ({
          id: z.id,
          rodzaj: z.kind,
          kiedy: z.completedAt?.toISOString() ?? null,
          wezel: { id: z.server.id, nazwa: nazwaWezla(z.server) },
          blad: (z.errorMessage ?? '').slice(0, 160) || null,
        })),
      },
      kopie: { kontaBezSwiezejKopii: bezKopii },
      przekroczenia: {
        kontDoba: zFaultami.length,
        najgorsze: zFaultami.slice(0, 5).map((w) => ({ serverId: w.serverId, wezel: w.wezel, domena: w.domena, subscriptionId: w.subscriptionId, razemDoba: w.razemDoba })),
      },
    };
  }

  async finanse(operator: { userId: string; role: string }, teraz = Date.now()) {
    // Jak „Nieudane płatności” (przegląd F3.6): personel widzi dokumenty kont klientów, konta zespołu — administrator.
    const klienci = operator.role === 'ADMIN' ? {} : { user: { role: Role.USER } };
    const [nieudane, odrzucone, odrzuconeLista, offline, doZaplaty, poTerminie, czekaNaFakture] = await Promise.all([
      this.rozliczenia ? this.rozliczenia.nieudanePlatnosci({ dni: 7, limit: 5 }, operator, new Date(teraz)) : null,
      this.prisma.invoice.count({ where: { ksefStatus: 'REJECTED', ...klienci } }),
      this.prisma.invoice.findMany({
        where: { ksefStatus: 'REJECTED', ...klienci },
        orderBy: { issuedAt: 'desc' },
        take: 5,
        select: { id: true, number: true, ksefError: true, issuedAt: true, user: { select: { email: true } } },
      }),
      this.prisma.invoice.count({ where: { ksefStatus: 'OFFLINE', ...klienci } }),
      this.prisma.invoice.aggregate({ where: { status: 'OPEN', ...klienci }, _count: { id: true }, _sum: { amount: true } }),
      this.prisma.invoice.count({ where: { status: 'OPEN', dueAt: { lt: new Date(teraz) }, ...klienci } }),
      this.prisma.invoice.aggregate({
        where: { rodzajPrawny: RODZAJ_DOKUMENT_ROZLICZENIOWY, externalInvoiceNumber: null, status: 'PAID', ...klienci },
        _count: { id: true },
        _min: { issuedAt: true },
      }),
    ]);
    return {
      nieudanePlatnosci: nieudane ? { tydzien: nieudane.total, ucieto: nieudane.ucieto, lista: nieudane.wiersze } : null,
      ksef: {
        odrzucone,
        doDoslania: offline,
        lista: odrzuconeLista.map((f) => ({ id: f.id, numer: f.number, blad: f.ksefError, wystawiono: f.issuedAt?.toISOString() ?? null, klient: f.user.email })),
      },
      doZaplaty: { dokumentow: doZaplaty._count.id, kwota: (doZaplaty._sum.amount ?? 0).toString(), poTerminie },
      doZaksiegowania: { wplat: czekaNaFakture._count.id, najstarsza: czekaNaFakture._min.issuedAt?.toISOString() ?? null },
    };
  }
}
