import { Injectable } from '@nestjs/common';
import { Prisma, Role, WalletTxStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { RODZAJ_DOKUMENT_ROZLICZENIOWY } from '../billing/tryb-fakturowania.js';
import { STOS_WEZLA } from '../servers/stos-wezla.js';
import {
  ZDARZENIA,
  czasTrwania,
  flotaZBazy,
  nazwaWezla,
  stanWezla,
  uwagaWezlow,
  type SprawaUwagi,
} from './stan-platformy.js';

const DZIEN = 86_400_000;
const ZAKLADANIE_ZA_DLUGO_MIN = 30;

/** Północ (czas Polski) `dni` dni temu — słupki KPI liczone po dniach kalendarzowych. */
function polnocPl(dni: number, teraz = new Date()): Date {
  const d = new Date(teraz.toLocaleString('en-US', { timeZone: 'Europe/Warsaw' }));
  const przesuniecie = d.getTime() - teraz.getTime();
  d.setHours(0, 0, 0, 0);
  return new Date(d.getTime() - przesuniecie - dni * DZIEN);
}

const kto = (u: { firstName: string | null; lastName: string | null; email: string } | null | undefined) =>
  u ? [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email : null;

@Injectable()
export class AdminDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async overview() {
    const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      userGroups,
      subscriptionGroups,
      serverGroups,
      ticketsOpen,
      walletByType,
      servers,
      recentSubscriptions,
      accountsTotal,
    ] = await Promise.all([
      this.prisma.user.groupBy({
        by: ['role'],
        _count: { id: true },
      }),
      this.prisma.subscription.groupBy({
        by: ['status'],
        _count: { id: true },
      }),
      this.prisma.server.groupBy({
        by: ['status'],
        _count: { id: true },
      }),
      this.prisma.ticket.count({
        where: { status: { in: ['OPEN', 'IN_PROGRESS'] } },
      }),
      this.prisma.walletTransaction.groupBy({
        by: ['type'],
        where: {
          createdAt: { gte: since30 },
          status: WalletTxStatus.COMPLETED,
        },
        _sum: { amount: true },
      }),
      this.prisma.server.findMany({
        orderBy: { updatedAt: 'desc' },
        take: 12,
        select: {
          id: true,
          name: true,
          ipAddress: true,
          status: true,
          region: true,
          lastHeartbeatAt: true,
          allocatedCpu: true,
          totalCpuCores: true,
        },
      }),
      this.prisma.subscription.findMany({
        take: 8,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          createdAt: true,
          priceAmount: true,
          currency: true,
          interval: true,
          plan: { select: { name: true, slug: true } },
          user: { select: { email: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.account.count(),
    ]);

    const usersByRole = Object.fromEntries(userGroups.map((r) => [r.role, r._count.id])) as Partial<
      Record<Role, number>
    > & { [k: string]: number };
    const subscriptionsByStatus = Object.fromEntries(
      subscriptionGroups.map((r) => [r.status, r._count.id]),
    );
    const serversByStatus = Object.fromEntries(serverGroups.map((r) => [r.status, r._count.id]));

    const clientUsers = usersByRole[Role.USER] ?? 0;
    const staffAndAdmin = (usersByRole[Role.STAFF] ?? 0) + (usersByRole[Role.ADMIN] ?? 0);

    const activeSubscriptions =
      subscriptionGroups.find((g) => g.status === 'ACTIVE')?._count.id ?? 0;

    const serverTotal = serverGroups.reduce((a, g) => a + g._count.id, 0);
    const serversActive = serverGroups.find((g) => g.status === 'ACTIVE')?._count.id ?? 0;

    let walletNet30d = new Prisma.Decimal(0);
    const walletByTypeOut: Record<string, string> = {};
    for (const row of walletByType) {
      const sum = row._sum.amount ?? new Prisma.Decimal(0);
      walletNet30d = walletNet30d.plus(sum);
      walletByTypeOut[row.type] = sum.toFixed(2);
    }

    const serverRows = servers.map((s) => ({
      id: s.id,
      name: (s.name && s.name.trim()) ? s.name : s.ipAddress,
      ipAddress: s.ipAddress,
      region: s.region,
      status: s.status,
      lastHeartbeatAt: s.lastHeartbeatAt?.toISOString() ?? null,
      allocatedCpu: s.allocatedCpu,
      totalCpuCores: s.totalCpuCores,
    }));

    const stan = await this.stanPlatformy();

    return {
      ...stan,
      generatedAt: new Date().toISOString(),
      users: {
        total: userGroups.reduce((a, g) => a + g._count.id, 0),
        clients: clientUsers,
        staffAndAdmin,
      },
      subscriptions: {
        byStatus: subscriptionsByStatus,
        active: activeSubscriptions,
      },
      servers: {
        total: serverTotal,
        active: serversActive,
        byStatus: serversByStatus,
      },
      accounts: { total: accountsTotal },
      tickets: { openNonClosed: ticketsOpen },
      billing: {
        periodDays: 30,
        walletNetPln: walletNet30d.toFixed(2),
        walletByTypePln: walletByTypeOut,
      },
      serverRows,
      recentSubscriptions,
    };
  }

  /** PB-34 — liczniki menu admina (Węzły / Kolejka zakładania / Migracje / Zgłoszenia). */
  async menu() {
    const teraz = Date.now();
    const [{ wezly }, zakladane, migracje, zgl] = await Promise.all([
      flotaZBazy(this.prisma, teraz),
      this.prisma.subscription.count({ where: { status: 'PROVISIONING' } }),
      this.prisma.migrationRequest.count({ where: { status: { in: ['QUEUED', 'RUNNING', 'ATTENTION'] } } }),
      this.zgloszenia(teraz),
    ]);
    return {
      wezlyUwaga: new Set(uwagaWezlow(wezly, teraz).map((u) => u.href)).size,
      zakladane,
      migracje,
      zgloszenia: zgl.otwarte,
      zgloszeniaPoTerminie: zgl.poTerminie,
      flota: { razem: wezly.filter((w) => w.status !== 'DEPROVISIONING').length, dziala: wezly.filter((w) => stanWezla(w, null, teraz) !== 'crit' && w.status === 'ACTIVE').length },
    };
  }

  private async zgloszenia(teraz: number) {
    const otwarte = { status: { not: 'CLOSED' } };
    const bezOdpowiedzi = { ...otwarte, firstResponseAt: null };
    const [razem, poTerminie, dzis] = await Promise.all([
      this.prisma.ticket.count({ where: otwarte }),
      this.prisma.ticket.count({ where: { ...bezOdpowiedzi, slaResponseDueAt: { lt: new Date(teraz) } } }),
      this.prisma.ticket.count({
        where: { ...bezOdpowiedzi, slaResponseDueAt: { gte: new Date(teraz), lt: polnocPl(-1, new Date(teraz)) } },
      }),
    ]);
    return { otwarte: razem, poTerminie, dzis };
  }

  /** PB-34 — dane pulpitu „Stan platformy” (makieta Main.dc.html). */
  private async stanPlatformy() {
    const teraz = Date.now();
    const od7 = polnocPl(6);
    const od30 = new Date(teraz - 30 * DZIEN);

    const [
      { wezly, wiersze: flota },
      manifest,
      zgl,
      poTerminieLista,
      fala,
      czekaNaFakture,
      webhookiBledne,
      zakladaneDlugo,
      migracjeUwaga,
      klienciRazem,
      klienciNowi,
      uslugiWg,
      wplaty,
      zdarzenia,
      noweUslugi,
    ] = await Promise.all([
      flotaZBazy(this.prisma, teraz),
      this.prisma.platformSetting.findUnique({ where: { key: 'stack.manifest' } }),
      this.zgloszenia(teraz),
      this.prisma.ticket.findMany({
        where: { status: { not: 'CLOSED' }, firstResponseAt: null, slaResponseDueAt: { lt: new Date(teraz) } },
        orderBy: { slaResponseDueAt: 'asc' },
        take: 5,
        select: {
          id: true,
          subject: true,
          slaResponseDueAt: true,
          user: { select: { firstName: true, lastName: true, email: true, companyName: true } },
        },
      }),
      this.prisma.auditLog.findFirst({
        where: { action: { in: ['FLEET_UPDATE_QUEUED', 'FLEET_UPDATE_FINISHED', 'FLEET_UPDATE_STOPPED'] } },
        orderBy: { createdAt: 'desc' },
        select: { action: true, details: true },
      }),
      this.prisma.invoice.aggregate({
        where: { rodzajPrawny: RODZAJ_DOKUMENT_ROZLICZENIOWY, externalInvoiceNumber: null, status: 'PAID' },
        _count: { id: true },
        _min: { issuedAt: true },
      }),
      this.prisma.stripeWebhookEvent.count({ where: { status: 'FAILED' } }),
      this.prisma.subscription.count({
        where: { status: 'PROVISIONING', updatedAt: { lt: new Date(teraz - ZAKLADANIE_ZA_DLUGO_MIN * 60_000) } },
      }),
      this.prisma.migrationRequest.count({ where: { status: 'ATTENTION' } }),
      this.prisma.user.count({ where: { role: Role.USER } }),
      this.prisma.user.findMany({ where: { role: Role.USER, createdAt: { gte: od7 } }, select: { createdAt: true } }),
      this.prisma.subscription.groupBy({ by: ['planId', 'status'], _count: { id: true } }),
      this.prisma.invoice.findMany({
        where: { status: 'PAID', kind: 'VAT', currency: 'PLN', paidAt: { gte: od30 } },
        select: { amount: true, paidAt: true },
      }),
      this.prisma.auditLog.findMany({
        where: { action: { in: Object.keys(ZDARZENIA) } },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          action: true,
          createdAt: true,
          details: true,
          actorUserId: true,
          user: { select: { id: true, firstName: true, lastName: true, email: true, companyName: true } },
        },
      }),
      this.prisma.subscription.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          status: true,
          interval: true,
          individualPrice: true,
          plan: { select: { name: true } },
          user: { select: { id: true, email: true, firstName: true, lastName: true, companyName: true } },
          account: { select: { domain: true, server: { select: { name: true, hostname: true, ipAddress: true } } } },
        },
      }),
    ]);

    // --- Flota
    let wersjaManifestu = STOS_WEZLA.wersja;
    try {
      if (manifest?.value) wersjaManifestu = (JSON.parse(manifest.value) as { wersja?: string }).wersja ?? wersjaManifestu;
    } catch {
      /* uszkodzony zapis — StosWezlaService też wraca wtedy do domyślnego */
    }

    // --- Wymaga uwagi (najpilniejsze na górze)
    const uwaga: SprawaUwagi[] = [...uwagaWezlow(wezly, teraz)];
    for (const t of poTerminieLista) {
      const po = Math.max(1, Math.floor((teraz - (t.slaResponseDueAt?.getTime() ?? teraz)) / 60_000));
      const klient = t.user.companyName?.trim() || kto(t.user);
      uwaga.push({
        waga: 'crit',
        tytul: `Zgłoszenie #${t.id.slice(0, 8)} po terminie pierwszej odpowiedzi`,
        opis: `„${t.subject}” · ${klient} · ${czasTrwania(po)} po terminie`,
        akcja: 'Otwórz',
        href: `/tickets/${t.id}`,
      });
    }
    if (zgl.poTerminie > poTerminieLista.length) {
      uwaga.push({
        waga: 'crit',
        tytul: `Jeszcze ${zgl.poTerminie - poTerminieLista.length} zgłoszeń po terminie SLA`,
        opis: 'pełna lista w skrzynce zgłoszeń',
        akcja: 'Skrzynka',
        href: '/tickets',
      });
    }
    if (fala?.action === 'FLEET_UPDATE_STOPPED') {
      const d = (fala.details ?? {}) as { serverId?: string; nr?: number; razem?: number; pozostale?: unknown[]; powod?: string };
      const w = wezly.find((x) => x.id === d.serverId);
      const pozostalo = Array.isArray(d.pozostale) ? d.pozostale.length : null;
      uwaga.push({
        waga: 'warn',
        tytul: d.nr && d.razem ? `Fala aktualizacji zatrzymana na węźle ${d.nr}/${d.razem}` : 'Fala aktualizacji zatrzymana',
        opis: [w ? nazwaWezla(w) : null, d.powod || 'aktualizacja węzła zwróciła błąd', pozostalo != null ? `pozostało ${pozostalo} węzłów` : null]
          .filter(Boolean)
          .join(' · '),
        akcja: 'Log',
        href: d.serverId ? `/nodes/${d.serverId}` : '/nodes/stack',
      });
    }
    if (czekaNaFakture._count.id > 0) {
      const najstarsza = czekaNaFakture._min.issuedAt;
      uwaga.push({
        waga: 'warn',
        tytul: `${czekaNaFakture._count.id} wpłat czeka na fakturę z programu księgowego`,
        opis: `${najstarsza ? `najstarsza z ${najstarsza.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Warsaw' })} · ` : ''}numer faktury wpisujesz przy wpłacie`,
        akcja: 'Kolejka',
        href: '/invoices/czeka-na-fakture',
      });
    }
    if (webhookiBledne > 0) {
      uwaga.push({
        waga: 'crit',
        tytul: `${webhookiBledne} zdarzeń płatności nie zostało obsłużonych`,
        opis: 'Stripe · ponowienia automatyczne lub ręczne z listy',
        akcja: 'Lista',
        href: '/billing/webhooki',
      });
    }
    if (zakladaneDlugo > 0) {
      uwaga.push({
        waga: 'warn',
        tytul: `${zakladaneDlugo} usług zakłada się dłużej niż ${ZAKLADANIE_ZA_DLUGO_MIN} min`,
        opis: 'klient czeka na hosting · sprawdź kolejkę zakładania',
        akcja: 'Kolejka',
        href: '/provisioning-queue',
      });
    }
    if (migracjeUwaga > 0) {
      uwaga.push({
        waga: 'warn',
        tytul: `${migracjeUwaga} migracji czeka na obsługę`,
        opis: 'automat zatrzymał się (błąd lub brak postępu)',
        akcja: 'Migracje',
        href: '/migrations',
      });
    }
    uwaga.sort((a, b) => (a.waga === b.waga ? 0 : a.waga === 'crit' ? -1 : 1));

    // --- KPI
    const dni = Array.from({ length: 7 }, (_, i) => polnocPl(6 - i).getTime());
    const dzienIdx = (d: Date) => {
      let i = -1;
      for (let k = 0; k < dni.length; k++) if (d.getTime() >= dni[k]!) i = k;
      return i;
    };
    const noweNaDzien = Array<number>(7).fill(0);
    for (const k of klienciNowi) {
      const i = dzienIdx(k.createdAt);
      if (i >= 0) noweNaDzien[i]!++;
    }
    // Liczba klientów na koniec każdego dnia (słupki rosnące jak w makiecie).
    const klienciDzienne: number[] = [];
    let narastajaco = klienciRazem - klienciNowi.length;
    for (const n of noweNaDzien) klienciDzienne.push((narastajaco += n));

    const planIds = [...new Set(uslugiWg.map((u) => u.planId))];
    const plany = new Map(
      (await this.prisma.plan.findMany({ where: { id: { in: planIds } }, select: { id: true, productKind: true } })).map((p) => [
        p.id,
        p.productKind,
      ]),
    );
    const uslugi = { aktywne: 0, hosting: 0, poczta: 0, inne: 0, zakladane: 0, zawieszone: 0, wszystkie: 0 };
    for (const u of uslugiWg) {
      const n = u._count.id;
      if (!['CANCELED', 'EXPIRED'].includes(u.status)) uslugi.wszystkie += n;
      if (u.status === 'PROVISIONING') uslugi.zakladane += n;
      if (u.status === 'SUSPENDED') uslugi.zawieszone += n;
      if (u.status !== 'ACTIVE' && u.status !== 'PAST_DUE') continue;
      uslugi.aktywne += n;
      const rodzaj = plany.get(u.planId);
      if (rodzaj === 'HOSTING') uslugi.hosting += n;
      else if (rodzaj === 'EMAIL') uslugi.poczta += n;
      else uslugi.inne += n;
    }

    let wplywy30 = new Prisma.Decimal(0);
    const wplywyDzienne = Array<number>(7).fill(0);
    for (const w of wplaty) {
      wplywy30 = wplywy30.plus(w.amount);
      const i = w.paidAt ? dzienIdx(w.paidAt) : -1;
      if (i >= 0) wplywyDzienne[i]! += Number(w.amount);
    }

    // --- Ostatnie zdarzenia
    const aktorzy = new Map(
      (
        await this.prisma.user.findMany({
          where: { id: { in: zdarzenia.map((z) => z.actorUserId).filter((x): x is string => !!x) } },
          select: { id: true, firstName: true, lastName: true, email: true, role: true },
        })
      ).map((u) => [u.id, u]),
    );
    const wezlyWg = new Map(wezly.map((w) => [w.id, nazwaWezla(w)]));
    const zdarzeniaOut = zdarzenia.map((z) => {
      const d = (z.details ?? {}) as { serverId?: string };
      const aktor = z.actorUserId ? aktorzy.get(z.actorUserId) : null;
      const klient = z.user ? z.user.companyName?.trim() || kto(z.user) : null;
      const wezel = d.serverId ? wezlyWg.get(d.serverId) ?? null : null;
      return {
        id: z.id,
        at: z.createdAt.toISOString(),
        tekst: ZDARZENIA[z.action] ?? z.action,
        kto: aktor && aktor.id !== z.user?.id ? `${aktor.firstName || kto(aktor)} (${aktor.role === 'ADMIN' ? 'admin' : 'obsługa'})` : null,
        czego: wezel ?? klient,
        href: wezel ? `/nodes/${d.serverId}` : z.user ? `/customers/${z.user.id}` : null,
      };
    });

    return {
      naUwadze: uwaga,
      flota: { manifest: wersjaManifestu, wezly: flota },
      klienci: { razem: klienciRazem, nowi7d: klienciNowi.length, dzienne7: klienciDzienne },
      uslugi,
      wplywy: { okresDni: 30, bruttoPln: wplywy30.toFixed(2), dzienne7: wplywyDzienne.map((x) => Math.round(x * 100) / 100) },
      zgloszenia: zgl,
      zdarzenia: zdarzeniaOut,
      noweUslugi: noweUslugi.map((s) => ({
        id: s.id,
        status: s.status,
        interval: s.interval,
        plan: s.plan.name,
        domena: s.account?.domain ?? null,
        wezel: s.account?.server ? nazwaWezla(s.account.server) : null,
        cenaIndywidualna: s.individualPrice?.toFixed(2) ?? null,
        klient: s.user.companyName?.trim() || kto(s.user),
        klientId: s.user.id,
      })),
    };
  }
}
