import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { uprawnieniaOperatora } from '../staff-roles/uprawnienia-operatora.js';
import type { Subscription } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { SubscriptionsService, type SuspendReason } from './subscriptions.service.js';
import { zgloszenieKlienta } from '../tickets/zgloszenie-klienta.js';

export { POWODY_ZAWIESZENIA_OPERATORA } from './powody-zawieszenia.js';

/**
 * F2.3 — zawieszenie i odwieszenie usługi przez operatora (karta usługi, wniosek, decyzja abuse). Jedno miejsce,
 * które sprawdza zgłoszenie klienta (D2: powód i numer zgłoszenia) i woła istniejące SubscriptionsService.suspend /
 * unsuspend — dziennik, stan na węźle i zdarzenia usługi są takie same jak przy zawieszeniu przez administratora.
 */
@Injectable()
export class ZawieszenieOperatoraService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subs: SubscriptionsService,
  ) {}

  /**
   * Zgłoszenie podane przez operatora: pełne id albo skrót z panelu („#ab12cd34”). Musi być zgłoszeniem klienta,
   * do którego należy usługa — cudzego numeru nie przyjmujemy (klient zobaczy go w swojej aktywności).
   */
  async zgloszenieKlienta(klientId: string, wpis: string | null | undefined): Promise<string | null> {
    return zgloszenieKlienta(this.prisma, klientId, wpis);
  }

  /**
   * Przegląd F2.3 — zawieszenie „za brak płatności” (PAYMENT_FAILED, GRACE_EXPIRED) ustawia tylko administrator
   * i harmonogram karencji; jego cofnięcie to decyzja rozliczeniowa (usługa wraca bez zapłaty, a licznik wygaśnięcia
   * po 14 dniach się zeruje). Odwiesza administrator albo pracownik z BILLING_MANAGE — także przez wniosek.
   */
  private async wymagajRozliczenPrzyZaleglosci(subscriptionId: string, aktorUserId: string): Promise<void> {
    const ostatnie = await this.prisma.subscriptionEvent.findFirst({
      where: { subscriptionId, type: 'SUSPENDED' },
      orderBy: { createdAt: 'desc' },
      select: { details: true },
    });
    const d = ostatnie?.details;
    const powod = d && typeof d === 'object' && !Array.isArray(d) ? (d as Record<string, unknown>).reason : null;
    if (powod !== 'PAYMENT_FAILED' && powod !== 'GRACE_EXPIRED') return;
    const aktor = await this.prisma.user.findUnique({ where: { id: aktorUserId }, select: { role: true } });
    if (aktor?.role === 'ADMIN') return;
    if (aktor?.role === 'STAFF' && (await uprawnieniaOperatora(this.prisma, aktorUserId)).includes('BILLING_MANAGE')) return;
    throw new ForbiddenException(
      'Usługa jest zawieszona za brak płatności — odwiesza administrator albo osoba z uprawnieniem do rozliczeń (BILLING_MANAGE). Klient może opłacić zaległość.',
    );
  }

  private async usluga(subscriptionId: string) {
    const s = await this.prisma.subscription.findUnique({ where: { id: subscriptionId }, select: { id: true, userId: true, status: true } });
    if (!s) throw new NotFoundException('Nie znaleziono usługi.');
    return s;
  }

  async zawies(input: {
    subscriptionId: string;
    aktorUserId: string;
    reason: SuspendReason;
    powod?: string | null;
    zgloszenie?: string | null;
  }): Promise<Subscription> {
    const s = await this.usluga(input.subscriptionId);
    const zgloszenieId = await this.zgloszenieKlienta(s.userId, input.zgloszenie);
    return this.subs.suspend({
      subscriptionId: s.id,
      reason: input.reason,
      note: input.powod?.trim() || undefined,
      actorUserId: input.aktorUserId,
      zgloszenieId,
      // Przegląd F2.3 — błąd węzła = błąd dla operatora (nie „zawieszona” przy działającej stronie).
      bladWezlaPrzerywa: true,
    });
  }

  async odwies(input: {
    subscriptionId: string;
    aktorUserId: string;
    powod?: string | null;
    zgloszenie?: string | null;
    chargeRenewal?: boolean;
  }): Promise<Subscription> {
    const s = await this.usluga(input.subscriptionId);
    await this.wymagajRozliczenPrzyZaleglosci(s.id, input.aktorUserId);
    const zgloszenieId = await this.zgloszenieKlienta(s.userId, input.zgloszenie);
    return this.subs.unsuspend({
      subscriptionId: s.id,
      note: input.powod?.trim() || undefined,
      chargeRenewal: input.chargeRenewal,
      actorUserId: input.aktorUserId,
      zgloszenieId,
    });
  }
}
