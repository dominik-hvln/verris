import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Subscription } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { SubscriptionsService, type SuspendReason } from './subscriptions.service.js';

export { POWODY_ZAWIESZENIA_OPERATORA } from './powody-zawieszenia.js';

const ID_ZGLOSZENIA = /^#?([0-9a-f]{8}(?:-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?)$/i;

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
    const tekst = (wpis ?? '').trim();
    if (!tekst) return null;
    const m = ID_ZGLOSZENIA.exec(tekst);
    if (!m) throw new BadRequestException('Numer zgłoszenia ma postać #ab12cd34 (8 znaków z panelu obsługi).');
    const id = m[1]!.toLowerCase();
    const trafienia = await this.prisma.ticket.findMany({
      where: { userId: klientId, ...(id.length > 8 ? { id } : { id: { startsWith: id } }) },
      select: { id: true },
      take: 2,
    });
    if (trafienia.length === 0) throw new BadRequestException('Nie ma takiego zgłoszenia u tego klienta.');
    if (trafienia.length > 1) throw new BadRequestException('Numer pasuje do kilku zgłoszeń — wklej pełny identyfikator.');
    return trafienia[0]!.id;
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
