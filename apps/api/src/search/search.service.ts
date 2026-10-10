import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { StaffPermission } from '../staff-roles/staff-permissions.catalog.js';
import { uprawnieniaOperatora } from '../staff-roles/uprawnienia-operatora.js';

export type SearchResultType = 'user' | 'service' | 'domain' | 'invoice' | 'node' | 'ticket' | 'migration';

export interface SearchResult {
  type: SearchResultType;
  id: string;
  title: string;
  subtitle: string;
  /** Ścieżka w panelu admina, do której prowadzi wynik. */
  href: string;
  /** Właściciel (do budowy tras w panelu staffa /crm/:userId). */
  userId: string | null;
  /** Węzeł: ServerStatus — paleta pokazuje działania dostępne w tym stanie. */
  status?: string;
}

/**
 * 10.10 (plan E, patch 5) — uprawnienia per typ wyniku: wystarcza JEDNO z listy. Te same, które otwierają
 * stronę, na którą prowadzi wynik (karta usługi: L1-KARTA, CUSTOMERS_VIEW albo SUBSCRIPTIONS_MANAGE).
 */
export const UPRAWNIENIA_TYPOW: Record<SearchResultType, readonly StaffPermission[]> = {
  user: ['CUSTOMERS_VIEW'],
  service: ['CUSTOMERS_VIEW', 'SUBSCRIPTIONS_MANAGE'],
  domain: ['CUSTOMERS_VIEW', 'SUBSCRIPTIONS_MANAGE'],
  invoice: ['CUSTOMERS_VIEW', 'BILLING_VIEW'],
  node: ['NODES_VIEW'],
  ticket: ['TICKETS_VIEW'],
  migration: ['MIGRATIONS_MANAGE'],
};

const TYPY = Object.keys(UPRAWNIENIA_TYPOW) as SearchResultType[];

/** Dla @StaffPermAny kontrolera: operator bez żadnego z nich dostaje 403. */
export const UPRAWNIENIA_WYSZUKIWARKI = [...new Set(Object.values(UPRAWNIENIA_TYPOW).flat())] as [StaffPermission, ...StaffPermission[]];

export function typyDozwolone(isAdmin: boolean, uprawnienia: readonly string[]): Set<SearchResultType> {
  return new Set(TYPY.filter((t) => isAdmin || UPRAWNIENIA_TYPOW[t].some((p) => uprawnienia.includes(p))));
}

/** Zalogowany z JWT (req.user) — jak w StaffPermissionsGuard: uprawnienia liczone dla principalUserId. */
export interface Wyszukujacy {
  role: string;
  userId: string;
  principalUserId?: string;
}

const STATUS_MIGRACJI: Record<string, string> = {
  DRAFT: 'czeka na zgodę klienta',
  QUEUED: 'w kolejce',
  RUNNING: 'w toku',
  ATTENTION: 'wymaga uwagi',
  COMPLETED: 'zakończona',
  FAILED: 'nieudana',
  CANCELED: 'anulowana',
};

/**
 * ADM-4 — globalna wyszukiwarka admin/staff. Jedno zapytanie przeszukuje klientów (e-mail/nazwa/NIP),
 * usługi (handle/ID), domeny/konta DA, faktury, węzły (nazwa, hostname, IP), zgłoszenia (numer, temat)
 * i migracje (domena) — tylko typy, do których operator ma uprawnienia. `pominiete` — typy pominięte
 * z braku uprawnień (paleta mówi o tym zamiast pokazać pustą listę). Deterministyczne, na danych.
 */
@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(rawQuery: string, kto: Wyszukujacy): Promise<{ results: SearchResult[]; pominiete: SearchResultType[] }> {
    const isAdmin = kto.role === 'ADMIN';
    const uprawnienia = isAdmin ? [] : await uprawnieniaOperatora(this.prisma, kto.principalUserId ?? kto.userId).catch(() => []);
    const wolno = typyDozwolone(isAdmin, uprawnienia);
    const pominiete = TYPY.filter((t) => !wolno.has(t));

    const q = (rawQuery ?? '').trim();
    if (q.length < 2) return { results: [], pominiete };
    const contains = { contains: q, mode: 'insensitive' as const };
    // Numer zgłoszenia w panelach to „#” + 8 pierwszych znaków UUID.
    const numer = q.replace(/^#/, '').toLowerCase();
    const poNumerze = /^[0-9a-f-]{4,36}$/.test(numer);
    const gdy = <T>(typ: SearchResultType, zapytanie: () => Promise<T[]>): Promise<T[]> =>
      wolno.has(typ) ? zapytanie() : Promise.resolve([]);

    const [users, accounts, subs, invoices, nodes, tickets, migrations] = await Promise.all([
      gdy('user', () =>
        this.prisma.user.findMany({
          where: {
            OR: [
              { email: contains },
              { firstName: contains },
              { lastName: contains },
              { companyName: contains },
              { nip: contains },
            ],
          },
          select: { id: true, email: true, firstName: true, lastName: true, companyName: true },
          take: 6,
          orderBy: { createdAt: 'desc' },
        }),
      ),
      gdy('domain', () =>
        this.prisma.account.findMany({
          where: { OR: [{ domain: contains }, { daUsername: contains }] },
          select: { id: true, domain: true, daUsername: true, subscriptionId: true, userId: true },
          take: 6,
        }),
      ),
      gdy('service', () =>
        this.prisma.subscription.findMany({
          where: { serviceTag: contains },
          select: {
            id: true,
            serviceTag: true,
            userId: true,
            plan: { select: { name: true } },
            user: { select: { email: true } },
          },
          take: 6,
          orderBy: { createdAt: 'desc' },
        }),
      ),
      gdy('invoice', () =>
        this.prisma.invoice
          .findMany({
            where: { number: contains },
            select: { id: true, number: true, userId: true },
            take: 5,
            orderBy: { createdAt: 'desc' },
          })
          .catch(() => [] as { id: string; number: string; userId: string }[]),
      ),
      gdy('node', () =>
        this.prisma.server.findMany({
          where: { OR: [{ name: contains }, { hostname: contains }, { ipAddress: contains }, { ipv6Address: contains }] },
          select: { id: true, name: true, hostname: true, ipAddress: true, status: true },
          take: 5,
          orderBy: { createdAt: 'asc' },
        }),
      ),
      gdy('ticket', () =>
        this.prisma.ticket.findMany({
          where: { OR: [{ subject: contains }, ...(poNumerze ? [{ id: { startsWith: numer } }] : [])] },
          select: { id: true, subject: true, userId: true, user: { select: { email: true } } },
          take: 5,
          orderBy: { createdAt: 'desc' },
        }),
      ),
      gdy('migration', () =>
        this.prisma.migrationRequest.findMany({
          where: { targetDomain: contains },
          select: { id: true, targetDomain: true, status: true, userId: true },
          take: 5,
          orderBy: { createdAt: 'desc' },
        }),
      ),
    ]);

    const results: SearchResult[] = [];
    const seenSub = new Set<string>();

    for (const u of users) {
      const name = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.companyName || '—';
      results.push({
        type: 'user',
        id: u.id,
        title: u.email,
        subtitle: `Klient · ${name}`,
        href: `/customers/${u.id}`,
        userId: u.id,
      });
    }
    for (const s of subs) {
      seenSub.add(s.id);
      results.push({
        type: 'service',
        id: s.id,
        title: s.serviceTag ?? s.id.slice(0, 8),
        subtitle: `Usługa · ${s.plan?.name ?? ''} · ${s.user?.email ?? ''}`.trim(),
        href: `/subscriptions/${s.id}`,
        userId: s.userId,
      });
    }
    for (const a of accounts) {
      if (a.subscriptionId && seenSub.has(a.subscriptionId)) continue;
      results.push({
        type: 'domain',
        id: a.id,
        title: a.domain,
        subtitle: `Domena · konto ${a.daUsername}`,
        href: a.subscriptionId ? `/subscriptions/${a.subscriptionId}` : '/subscriptions',
        userId: a.userId,
      });
    }
    for (const inv of invoices) {
      results.push({
        type: 'invoice',
        id: inv.id,
        title: inv.number,
        subtitle: 'Faktura',
        // Strona faktury (plan E, patch 10) wymaga BILLING_VIEW (GET admin/invoices/:id); z samym CUSTOMERS_VIEW —
        // rozliczenia na karcie klienta.
        href: isAdmin || uprawnienia.includes('BILLING_VIEW') ? `/invoices/${inv.id}` : `/customers/${inv.userId}?sekcja=rozliczenia`,
        userId: inv.userId,
      });
    }
    for (const n of nodes) {
      results.push({
        type: 'node',
        id: n.id,
        title: n.name ?? n.hostname ?? n.ipAddress,
        subtitle: ['Węzeł', n.hostname, n.ipAddress].filter(Boolean).join(' · '),
        href: `/nodes/${n.id}`,
        userId: null,
        status: n.status,
      });
    }
    for (const t of tickets) {
      results.push({
        type: 'ticket',
        id: t.id,
        title: t.subject,
        subtitle: `Zgłoszenie #${t.id.slice(0, 8)} · ${t.user?.email ?? ''}`.trim(),
        // Zakładka zgłoszeń na karcie klienta wymaga CUSTOMERS_VIEW; z samym TICKETS_VIEW — lista zgłoszeń.
        href: wolno.has('user') ? `/customers/${t.userId}?sekcja=zgloszenia` : '/tickets',
        userId: t.userId,
      });
    }
    for (const m of migrations) {
      results.push({
        type: 'migration',
        id: m.id,
        title: m.targetDomain ?? m.id.slice(0, 8),
        subtitle: `Migracja · ${STATUS_MIGRACJI[m.status] ?? m.status}`,
        href: `/migrations/${m.id}`,
        userId: m.userId,
      });
    }

    return { results: results.slice(0, 20), pominiete };
  }
}
