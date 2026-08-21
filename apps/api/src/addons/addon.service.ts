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
 * Z-06 — okno, w którym powtórzony zakup tego samego dodatku dla tej samej
 * usługi uznajemy za DUPLIKAT, a nie za drugi świadomy zakup.
 *
 * Pięć minut to kompromis: podwójne kliknięcie, retry po zerwanej sieci
 * i cofnięcie formularza mieszczą się w sekundach, a klient, który naprawdę
 * chce kupić drugie dedykowane IP, zrobi to później niż po pięciu minutach.
 *
 * To jest ZAPASOWA ścieżka. Gdy panel poda własny klucz idempotencji, okno
 * w ogóle nie wchodzi w grę — i to jest wariant mocniejszy, bo nie ma granicy
 * przedziału, na której dwa kliknięcia mogłyby wpaść do dwóch różnych okien.
 */
const OKNO_IDEMPOTENCJI_MS = 5 * 60 * 1000;

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

  /**
   * Z-06 — klucz identyfikujący JEDNĄ decyzję zakupu.
   *
   * Poprzednia wersja brzmiała `addon-${userId}-${slug}-${Date.now()}`. Znacznik
   * czasu sprawiał, że każde kliknięcie dawało inny klucz, więc mechanizm
   * idempotencji w księdze portfela nie miał czego porównywać: dziesięć kliknięć
   * to było dziesięć obciążeń.
   *
   * Samo usunięcie `Date.now()` nie wystarcza — klucz stały na zawsze
   * zablokowałby drugi, świadomy zakup tego samego dodatku (a dedykowane IP czy
   * konfigurację przez specjalistę można kupić więcej niż raz). Stąd dwie drogi:
   * klucz od klienta (mocniejsza) albo okno czasu (zapasowa).
   */
  private kluczIdempotencji(
    userId: string,
    slug: string,
    subscriptionId: string | undefined,
    klientKey: string | undefined,
    teraz: number,
  ): string {
    if (klientKey) return `addon:v1:${userId}:${klientKey}`;
    const okno = Math.floor(teraz / OKNO_IDEMPOTENCJI_MS);
    return `addon:v1:${userId}:${slug}:${subscriptionId ?? '-'}:${okno}`;
  }

  /** Odpowiedź dla zakupu, który już istnieje — bez ponownego obciążenia. */
  private odpowiedzZRekordu(rekord: {
    id: string;
    name: string;
    status: string;
    ticketId: string | null;
    slug: string;
  }) {
    const def = CATALOG[rekord.slug];
    return {
      ok: true as const,
      id: rekord.id,
      name: rekord.name,
      status: rekord.status,
      ticketId: rekord.ticketId,
      duplikat: true as const,
      note:
        def?.mode === 'workorder'
          ? 'Ten dodatek jest już wykupiony — zlecenie dla zespołu czeka w zgłoszeniu. Nie pobraliśmy opłaty drugi raz.'
          : 'Ten dodatek jest już aktywny. Nie pobraliśmy opłaty drugi raz.',
    };
  }

  async purchase(
    userId: string,
    slug: string,
    subscriptionId?: string,
    klientKey?: string,
  ) {
    const def = CATALOG[slug];
    if (!def) throw new BadRequestException('Nieznany dodatek.');

    const klucz = this.kluczIdempotencji(userId, slug, subscriptionId, klientKey, Date.now());

    // Szybkie wyjście: ten zakup już był. Pomija obciążenie ORAZ skutki uboczne
    // — bez tego poprawka broniłaby tylko portfela, a klient i tak dostałby
    // dziesięć zgłoszeń do BOK-u i dziesięć wpisów w historii zakupów.
    const istniejacy = await this.prisma.purchasedAddon.findUnique({
      where: { idempotencyKey: klucz },
    });
    if (istniejacy) {
      this.logger.log(`Powtórzony zakup dodatku (klucz=${klucz}, id=${istniejacy.id}) — bez opłaty`);
      return this.odpowiedzZRekordu(istniejacy);
    }

    const amount = new Prisma.Decimal(def.price);
    await this.wallet.debit({
      userId,
      type: WalletTxType.CHARGE_USAGE,
      amount,
      description: `Dodatek: ${def.name}`,
      idempotencyKey: klucz,
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

    let record;
    try {
      record = await this.prisma.purchasedAddon.create({
        data: {
          userId,
          slug: def.slug,
          name: def.name,
          amount,
          subscriptionId: subscriptionId ?? null,
          status,
          ticketId,
          idempotencyKey: klucz,
        },
      });
    } catch (e) {
      // Wyścig: dwa równoległe żądania przeszły obok sprawdzenia wyżej. Portfel
      // obciążył raz (unikalny klucz w księdze), a tutaj drugie żądanie dostaje
      // P2002 z unikalnego indeksu i zwraca rekord utworzony przez pierwsze.
      const p2002 =
        typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002';
      if (!p2002) throw e;
      const rekord = await this.prisma.purchasedAddon.findUnique({
        where: { idempotencyKey: klucz },
      });
      if (!rekord) throw e;
      this.logger.log(`Wyścig przy zakupie dodatku (klucz=${klucz}) — zwracam ${rekord.id}`);
      return this.odpowiedzZRekordu(rekord);
    }

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
