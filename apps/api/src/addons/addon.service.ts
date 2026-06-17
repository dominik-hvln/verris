import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma, WalletTxType } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { WalletLedgerService } from '../billing/wallet-ledger.service';
import { TicketsService } from '../tickets/tickets.service';

type AddonMode = 'flag' | 'workorder';

interface AddonDef {
  slug: string;
  name: string;
  description: string;
  price: number;
  mode: AddonMode;
}

const CATALOG: Record<string, AddonDef> = {
  priority_support_30d: {
    slug: 'priority_support_30d',
    name: 'Priorytetowe wsparcie (30 dni)',
    description: 'Twoje zgłoszenia obsługujemy poza kolejnością przez 30 dni.',
    price: 49,
    mode: 'flag',
  },
  manual_setup: {
    slug: 'manual_setup',
    name: 'Konfiguracja przez specjalistę',
    description: 'Nasz zespół skonfiguruje dla Ciebie stronę / pocztę / DNS — jednorazowo.',
    price: 99,
    mode: 'workorder',
  },
  dedicated_ip: {
    slug: 'dedicated_ip',
    name: 'Dedykowane IP',
    description: 'Przydzielimy dedykowany adres IP do Twojego konta hostingowego.',
    price: 25,
    mode: 'workorder',
  },
};

const PRIORITY_DAYS = 30;

/**
 * P-8 — one-time add-on store, paid from the wallet. Two fulfilment modes:
 *  - 'flag'     → instant account flag (e.g. priority support window),
 *  - 'workorder'→ auto-creates a staff ticket for manual fulfilment.
 */
@Injectable()
export class AddonService {
  private readonly logger = new Logger(AddonService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly wallet: WalletLedgerService,
    private readonly tickets: TicketsService,
  ) {}

  catalog() {
    return Object.values(CATALOG).map((a) => ({
      slug: a.slug,
      name: a.name,
      description: a.description,
      price: a.price.toFixed(2),
      currency: 'PLN',
    }));
  }

  async overview(userId: string) {
    const [purchased, user] = await Promise.all([
      this.prisma.purchasedAddon.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { prioritySupport: true, prioritySupportUntil: true },
      }),
    ]);
    const priorityActive =
      !!user?.prioritySupport &&
      !!user.prioritySupportUntil &&
      user.prioritySupportUntil.getTime() > Date.now();
    return {
      catalog: this.catalog(),
      prioritySupport: { active: priorityActive, until: user?.prioritySupportUntil?.toISOString() ?? null },
      purchased: purchased.map((p) => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        amount: p.amount.toString(),
        status: p.status,
        createdAt: p.createdAt.toISOString(),
      })),
    };
  }

  async purchase(userId: string, slug: string, subscriptionId?: string) {
    const def = CATALOG[slug];
    if (!def) throw new BadRequestException('Nieznany dodatek.');

    const amount = new Prisma.Decimal(def.price);
    await this.wallet.debit({
      userId,
      type: WalletTxType.CHARGE_USAGE,
      amount,
      description: `Dodatek: ${def.name}`,
      idempotencyKey: `addon-${userId}-${slug}-${Date.now()}`,
      subscriptionId: subscriptionId ?? undefined,
    });

    let status = 'APPLIED';
    let ticketId: string | null = null;

    if (def.mode === 'flag' && slug === 'priority_support_30d') {
      const until = new Date(Date.now() + PRIORITY_DAYS * 24 * 60 * 60 * 1000);
      await this.prisma.user.update({
        where: { id: userId },
        data: { prioritySupport: true, prioritySupportUntil: until },
      });
    } else if (def.mode === 'workorder') {
      const ticket = await this.tickets.create(userId, {
        subject: `Dodatek: ${def.name}`,
        message: `Klient wykupił dodatek „${def.name}". ${def.description}\n\nProszę o realizację${
          subscriptionId ? ` (usługa: ${subscriptionId})` : ''
        }.`,
        department: 'TECHNICAL',
        topic: 'OTHER',
        priority: 'HIGH',
      });
      ticketId = (ticket as { id?: string } | null)?.id ?? null;
      status = 'QUEUED';
    }

    const record = await this.prisma.purchasedAddon.create({
      data: {
        userId,
        slug: def.slug,
        name: def.name,
        amount,
        subscriptionId: subscriptionId ?? null,
        status,
        ticketId,
      },
    });

    await this.audit.record({
      action: 'ADDON_PURCHASED',
      userId,
      actorUserId: userId,
      details: { slug: def.slug, amount: def.price, status, ticketId },
    });

    return {
      ok: true as const,
      id: record.id,
      name: def.name,
      status,
      ticketId,
      note:
        def.mode === 'workorder'
          ? 'Utworzyliśmy zlecenie dla naszego zespołu — odezwiemy się przez zgłoszenie.'
          : 'Dodatek aktywny od teraz.',
    };
  }
}
