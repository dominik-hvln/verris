import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BillingInterval,
  Prisma,
  Role,
  SubscriptionPaymentSource,
  SubscriptionStatus,
} from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { SubscriptionsService } from './subscriptions.service';
import type { CreateSubscriptionDto } from './dto/subscription.dto';

/** Usługi, które jeszcze „żyją” — zmiana sposobu rozliczenia dotyczy tylko ich. */
const ZYWE: SubscriptionStatus[] = [
  SubscriptionStatus.PENDING_PAYMENT,
  SubscriptionStatus.PROVISIONING,
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAST_DUE,
  SubscriptionStatus.SUSPENDED,
];

export interface NowaUslugaOperatora {
  planId: string;
  interval: BillingInterval;
  domain?: string;
  individualPrice?: number | null;
  autoscalingDiscountPct?: number;
  powod: string;
}

/**
 * PB-27 / PB-28 — indywidualne warunki ustawiane przez operatora:
 * własna cena usługi (także przy odnowieniach), rabat na autoskalowanie
 * i rozliczenie całego konta poza Verris (bez pobierania opłat).
 * Każda zmiana idzie do dziennika audytu z autorem i powodem.
 */
@Injectable()
export class WarunkiIndywidualneService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly subs: SubscriptionsService,
  ) {}

  async podglad(userId: string, od?: Date, do_?: Date) {
    const user = await this.klient(userId);
    const koniec = do_ ?? new Date();
    const poczatek = od ?? new Date(koniec.getFullYear(), koniec.getMonth(), 1);
    const uslugi = await this.prisma.subscription.findMany({
      where: { userId, status: { in: ZYWE } },
      select: {
        id: true,
        status: true,
        interval: true,
        priceAmount: true,
        listPriceAmount: true,
        individualPrice: true,
        autoscalingDiscountPct: true,
        individualTermsNote: true,
        individualTermsAt: true,
        paymentSource: true,
        currentPeriodEnd: true,
        plan: { select: { name: true, priceMonthly: true, priceYearly: true } },
        account: { select: { domain: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    // Zestawienie autoskalowania do faktury właściciela (bloki bez obciążenia portfela).
    const bloki = await this.prisma.autoscalingEvent.groupBy({
      by: ['subscriptionId'],
      where: {
        subscription: { userId },
        reason: { startsWith: 'outside_block' },
        createdAt: { gte: poczatek, lte: koniec },
      },
      _sum: { costSnapshot: true },
      _count: { _all: true },
    });
    // Operator może założyć usługę także na planie ukrytym (oferta indywidualna).
    const plany = await this.prisma.plan.findMany({
      where: { isActive: true },
      select: { id: true, name: true, isPublic: true, priceMonthly: true, priceYearly: true },
      orderBy: [{ isPublic: 'desc' }, { priceMonthly: 'asc' }],
    });
    return {
      billingOutside: user.billingOutside,
      plany: plany.map((p) => ({
        id: p.id,
        nazwa: p.name,
        ukryty: !p.isPublic,
        miesiecznie: p.priceMonthly?.toString() ?? null,
        rocznie: p.priceYearly?.toString() ?? null,
      })),
      okres: { od: poczatek.toISOString(), do: koniec.toISOString() },
      uslugi: uslugi.map((u) => ({
        id: u.id,
        status: u.status,
        interval: u.interval,
        domena: u.account?.domain ?? null,
        plan: u.plan?.name ?? null,
        cenaCennik: (u.interval === 'YEAR' ? u.plan?.priceYearly : u.plan?.priceMonthly)?.toString() ?? null,
        cenaIndywidualna: u.individualPrice?.toString() ?? null,
        rabatAutoskalowaniaPct: u.autoscalingDiscountPct,
        notatka: u.individualTermsNote,
        ustalonoAt: u.individualTermsAt,
        pozaVerris: u.paymentSource === SubscriptionPaymentSource.MANUAL,
        odnowienie: u.currentPeriodEnd,
      })),
      autoskalowaniePoza: bloki.map((b) => ({
        subscriptionId: b.subscriptionId,
        bloki: b._count._all,
        kwota: (b._sum.costSnapshot ?? new Prisma.Decimal(0)).toFixed(2),
      })),
    };
  }

  async zalozUsluge(actorUserId: string, userId: string, dto: NowaUslugaOperatora) {
    const user = await this.klient(userId);
    const cena = this.cena(dto.individualPrice);
    const zlecenie = {
      planId: dto.planId,
      interval: dto.interval,
      domain: dto.domain,
      paymentSource: user.billingOutside ? SubscriptionPaymentSource.MANUAL : SubscriptionPaymentSource.WALLET,
      // Zgoda konsumencka nie jest tu zbierana — ścieżka operatora zapisuje w audycie
      // autora i powód zamiast oświadczenia klienta (SubscriptionsService.create).
      immediatePerformanceConsent: true,
    } as CreateSubscriptionDto;
    return this.subs.create(userId, zlecenie, {
      allowManual: user.billingOutside,
      operator: {
        actorUserId,
        powod: dto.powod,
        individualPrice: cena,
        autoscalingDiscountPct: this.rabat(dto.autoscalingDiscountPct),
      },
    });
  }

  async ustawWarunki(
    actorUserId: string,
    subscriptionId: string,
    dto: { individualPrice: number | null; autoscalingDiscountPct: number; powod: string },
  ) {
    const sub = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      select: {
        id: true,
        userId: true,
        status: true,
        paymentSource: true,
        stripeSubscriptionId: true,
        individualPrice: true,
        autoscalingDiscountPct: true,
        priceAmount: true,
        listPriceAmount: true,
      },
    });
    if (!sub) throw new NotFoundException('Nie ma takiej usługi.');
    if (sub.paymentSource === SubscriptionPaymentSource.STRIPE_CARD && sub.stripeSubscriptionId) {
      throw new ConflictException(
        'Usługa jest opłacana cyklicznie kartą według cennika Stripe — indywidualna cena działa dla portfela i rozliczenia poza Verris.',
      );
    }
    const cena = this.cena(dto.individualPrice);
    const rabat = this.rabat(dto.autoscalingDiscountPct);
    const zwykle = cena === null && rabat === 0;
    await this.prisma.subscription.update({
      where: { id: sub.id },
      data: {
        individualPrice: cena,
        // Cena w panelu klienta, MRR i „odwieś z opłatą” czytają priceAmount — trzymamy je zgodne.
        priceAmount: cena ?? sub.listPriceAmount ?? sub.priceAmount,
        autoscalingDiscountPct: rabat,
        individualTermsNote: zwykle ? null : dto.powod,
        individualTermsById: zwykle ? null : actorUserId,
        individualTermsAt: zwykle ? null : new Date(),
      },
    });
    await this.audit.record({
      action: 'SUBSCRIPTION_CUSTOM_TERMS',
      userId: sub.userId,
      actorUserId,
      details: {
        subscriptionId: sub.id,
        powod: dto.powod,
        przed: { cena: sub.individualPrice?.toFixed(2) ?? null, rabatAutoskalowaniaPct: sub.autoscalingDiscountPct },
        po: { cena: cena?.toFixed(2) ?? null, rabatAutoskalowaniaPct: rabat },
      },
    });
    return this.podglad(sub.userId);
  }

  async rozliczeniePoza(actorUserId: string, userId: string, dto: { wlaczone: boolean; powod: string }) {
    const user = await this.klient(userId);
    if (user.billingOutside === dto.wlaczone) return this.podglad(userId);

    if (dto.wlaczone) {
      const karta = await this.prisma.subscription.count({
        where: {
          userId,
          status: { in: ZYWE },
          paymentSource: SubscriptionPaymentSource.STRIPE_CARD,
          stripeSubscriptionId: { not: null },
        },
      });
      if (karta > 0) {
        throw new ConflictException(
          'Klient ma usługę opłacaną cyklicznie kartą. Najpierw trzeba ją anulować w Stripe albo przełączyć na portfel — inaczej karta dalej byłaby obciążana.',
        );
      }
    }

    const wynik = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { billingOutside: dto.wlaczone } });
      const zmienione = await tx.subscription.updateMany({
        where: {
          userId,
          status: { in: ZYWE },
          paymentSource: dto.wlaczone ? { not: SubscriptionPaymentSource.MANUAL } : SubscriptionPaymentSource.MANUAL,
        },
        data: { paymentSource: dto.wlaczone ? SubscriptionPaymentSource.MANUAL : SubscriptionPaymentSource.WALLET },
      });
      // Zaległa płatność przestaje istnieć, gdy rozlicza właściciel.
      const odwieszone = dto.wlaczone
        ? await tx.subscription.updateMany({
            where: { userId, status: SubscriptionStatus.PAST_DUE },
            data: { status: SubscriptionStatus.ACTIVE },
          })
        : { count: 0 };
      return { uslugi: zmienione.count, zaleglosci: odwieszone.count };
    });

    await this.audit.record({
      action: dto.wlaczone ? 'BILLING_OUTSIDE_ENABLED' : 'BILLING_OUTSIDE_DISABLED',
      userId,
      actorUserId,
      details: { powod: dto.powod, ...wynik },
    });
    return this.podglad(userId);
  }

  private async klient(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, billingOutside: true, anonymizedAt: true },
    });
    if (!user || user.role !== Role.USER || user.anonymizedAt) {
      throw new NotFoundException('Nie ma takiego klienta.');
    }
    return user;
  }

  private cena(v: number | null | undefined): Prisma.Decimal | null {
    if (v === null || v === undefined) return null;
    if (!Number.isFinite(v) || v < 0 || v > 100000) {
      throw new BadRequestException('Cena musi być liczbą od 0 do 100 000.');
    }
    return new Prisma.Decimal(v).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  }

  private rabat(v: number | undefined): number {
    if (v === undefined) return 0;
    if (!Number.isInteger(v) || v < 0 || v > 100) {
      throw new BadRequestException('Rabat na autoskalowanie to liczba całkowita od 0 do 100 (%).');
    }
    return v;
  }
}
