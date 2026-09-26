import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CATEGORY_LABEL,
  KB_TERMS,
  buildDraft,
  classifyTicket,
  templateVars,
  type TicketCategory,
  type TicketDraftContext,
} from './ticket-context.js';

const KB_BASE = () => (process.env.KB_PUBLIC_URL || 'https://pomoc.verris.pl').replace(/\/$/, '');
const ACTIVE = ['ACTIVE', 'PAST_DUE', 'PROVISIONING', 'SUSPENDED'] as const;

/**
 * PB-18 — boczny podgląd klienta w tickecie (usługi, saldo, dokumenty,
 * zdarzenia, poprzednie zgłoszenia, health score) oraz klasyfikacja i szkic
 * odpowiedzi. Tylko odczyt — nic tu nie zmienia stanu konta.
 */
@Injectable()
export class TicketContextService {
  constructor(private readonly prisma: PrismaService) {}

  private async load(ticketId: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        subject: true,
        message: true,
        topic: true,
        slaResolveDueAt: true,
        userId: true,
        user: { select: { firstName: true, lastName: true, email: true, companyName: true, walletBalance: true, createdAt: true } },
      },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    const [subs, invoices, tickets] = await Promise.all([
      this.prisma.subscription.findMany({
        where: { userId: ticket.userId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          status: true,
          currentPeriodEnd: true,
          plan: { select: { name: true } },
          account: { select: { domain: true } },
          siteMonitor: { select: { tlsExpiresAt: true, lastStatus: true } },
          healthSnapshots: { orderBy: { computedAt: 'desc' }, take: 1, select: { score: true } },
          events: { orderBy: { createdAt: 'desc' }, take: 5, select: { type: true, createdAt: true } },
        },
      }),
      this.prisma.invoice.findMany({
        where: { userId: ticket.userId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, number: true, status: true, amount: true, currency: true, createdAt: true },
      }),
      this.prisma.ticket.findMany({
        where: { userId: ticket.userId, id: { not: ticket.id } },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, subject: true, status: true, createdAt: true },
      }),
    ]);
    return { ticket, subs, invoices, tickets };
  }

  private draftContext(
    d: Awaited<ReturnType<TicketContextService['load']>>,
    kb: { title: string; url: string }[],
  ): TicketDraftContext {
    const { ticket, subs, invoices } = d;
    // ponytail: zgłoszenie nie wskazuje usługi — bierzemy domenę wymienioną w treści, inaczej pierwszą aktywną.
    const text = `${ticket.subject} ${ticket.message}`.toLowerCase();
    const live = subs.filter((s) => (ACTIVE as readonly string[]).includes(s.status));
    const svc = live.find((s) => s.account?.domain && text.includes(s.account.domain.toLowerCase())) ?? live[0] ?? null;
    return {
      firstName: ticket.user.firstName,
      lastName: ticket.user.lastName,
      email: ticket.user.email,
      company: ticket.user.companyName,
      ticketId: ticket.id,
      subject: ticket.subject,
      slaResolveDueAt: ticket.slaResolveDueAt,
      service: svc
        ? {
            plan: svc.plan?.name ?? null,
            domain: svc.account?.domain ?? null,
            sslExpiresAt: svc.siteMonitor?.tlsExpiresAt ?? null,
            siteDown: svc.siteMonitor?.lastStatus === 'DOWN',
          }
        : null,
      walletBalance: ticket.user.walletBalance != null ? Number(ticket.user.walletBalance).toFixed(2).replace('.', ',') : null,
      lastInvoice: invoices[0] ? { number: invoices[0].number, status: invoices[0].status } : null,
      kb,
    };
  }

  private async kbFor(category: TicketCategory): Promise<{ title: string; url: string }[]> {
    const terms = KB_TERMS[category];
    if (terms.length === 0) return [];
    const rows = await this.prisma.kbArticle.findMany({
      where: { status: 'PUBLISHED', OR: terms.map((t) => ({ title: { contains: t, mode: 'insensitive' as const } })) },
      orderBy: { views: 'desc' },
      take: 3,
      select: { title: true, slug: true },
    });
    return rows.map((r) => ({ title: r.title, url: `${KB_BASE()}/a/${r.slug}` }));
  }

  /** Zmienne szablonów dla ticketu (bez szkicu i KB — do renderowania szablonów). */
  async varsFor(ticketId: string): Promise<Record<string, string>> {
    return templateVars(this.draftContext(await this.load(ticketId), []));
  }

  async contextFor(ticketId: string) {
    const data = await this.load(ticketId);
    const { ticket, subs, invoices, tickets } = data;
    const category = classifyTicket(ticket);
    const kb = await this.kbFor(category);
    const dctx = this.draftContext(data, kb);
    const scores = subs.map((s) => s.healthSnapshots[0]?.score).filter((n): n is number => typeof n === 'number');
    return {
      client: {
        name: [ticket.user.firstName, ticket.user.lastName].filter(Boolean).join(' ') || null,
        email: ticket.user.email,
        company: ticket.user.companyName,
        walletBalance: dctx.walletBalance,
        since: ticket.user.createdAt,
      },
      healthScore: scores.length ? Math.min(...scores) : null,
      services: subs.map((s) => ({
        id: s.id,
        plan: s.plan?.name ?? null,
        status: s.status,
        domain: s.account?.domain ?? null,
        healthScore: s.healthSnapshots[0]?.score ?? null,
        siteStatus: s.siteMonitor?.lastStatus ?? null,
        sslExpiresAt: s.siteMonitor?.tlsExpiresAt ?? null,
        currentPeriodEnd: s.currentPeriodEnd,
      })),
      invoices: invoices.map((i) => ({ ...i, amount: i.amount.toString() })),
      events: subs
        .flatMap((s) => s.events.map((e) => ({ ...e, domain: s.account?.domain ?? s.plan?.name ?? null })))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, 8),
      tickets,
      category,
      categoryLabel: CATEGORY_LABEL[category],
      draft: buildDraft(category, dctx),
      kb,
    };
  }
}
