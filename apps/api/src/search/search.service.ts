import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type SearchResultType = 'user' | 'service' | 'domain' | 'invoice';

export interface SearchResult {
  type: SearchResultType;
  id: string;
  title: string;
  subtitle: string;
  /** Ścieżka w panelu admina, do której prowadzi wynik. */
  href: string;
  /** Właściciel (do budowy tras w panelu staffa /crm/:userId). */
  userId: string | null;
}

/**
 * ADM-4 — globalna wyszukiwarka admin/staff. Jedno zapytanie przeszukuje
 * klientów (e-mail/nazwa/NIP), usługi (handle/ID), domeny/konta DA oraz faktury,
 * zwracając ujednoliconą listę z linkiem docelowym. Deterministyczne, na danych.
 */
@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(rawQuery: string): Promise<{ results: SearchResult[] }> {
    const q = (rawQuery ?? '').trim();
    if (q.length < 2) return { results: [] };
    const contains = { contains: q, mode: 'insensitive' as const };

    const [users, accounts, subs, invoices] = await Promise.all([
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
      this.prisma.account.findMany({
        where: { OR: [{ domain: contains }, { daUsername: contains }] },
        select: { id: true, domain: true, daUsername: true, subscriptionId: true, userId: true },
        take: 6,
      }),
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
      this.prisma.invoice
        .findMany({
          where: { number: contains },
          select: { id: true, number: true, userId: true },
          take: 5,
          orderBy: { createdAt: 'desc' },
        })
        .catch(() => [] as { id: string; number: string; userId: string }[]),
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
        href: `/customers/${inv.userId}`,
        userId: inv.userId,
      });
    }

    return { results: results.slice(0, 20) };
  }
}
