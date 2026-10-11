import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { StripeService } from './stripe/stripe.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { MailerService } from '../mail/mailer.service.js';
import { walletAutoTopupFailedTemplate } from '../mail/templates/billing-lifecycle-notifications.js';

const COOLDOWN_MS = 60 * 60 * 1000;

export type WynikProby =
  | { wynik: 'zlecono'; status: string; paymentIntentId: string }
  | { wynik: 'pominieto'; powod: string }
  | { wynik: 'blad'; powod: string };

/**
 * F3.6 — czy operator może ponowić auto-doładowanie (null = może). Płatność „w przetwarzaniu” (`status=processing`)
 * jeszcze może wejść — ponowienie obciążyłoby kartę drugi raz.
 */
export function powodBlokadyPonowienia(r: { enabled: boolean; lastAttemptOk: boolean | null; lastAttemptError: string | null }): string | null {
  if (!r.enabled) return 'Auto-doładowanie jest wyłączone przez klienta.';
  if (r.lastAttemptOk === null) return 'Próba auto-doładowania właśnie trwa albo jeszcze się nie odbyła.';
  if (r.lastAttemptOk) return 'Ostatnie auto-doładowanie się udało — nie ma czego ponawiać.';
  if (/^status=(processing|requires_capture)/.test(r.lastAttemptError ?? '')) {
    return 'Płatność jest w przetwarzaniu u operatora kart — poczekaj na jej wynik.';
  }
  return null;
}

const POWODY_AUTODOLADOWANIA: [RegExp, string][] = [
  [/insufficient.?funds|brak\w* środków/i, 'Na karcie brakuje środków.'],
  [/expired|wygas/i, 'Karta wygasła.'],
  [/3ds|authenticat|requires_action|autoryzacj/i, 'Karta wymaga dodatkowej autoryzacji (3DS) — zmień metodę płatności lub doładuj portfel ręcznie.'],
  [/declin|do.not.honor|odrzuci/i, 'Bank odrzucił płatność kartą.'],
  [/brak zapisanej karty|no such payment.?method/i, 'Brak zapisanej karty — ustaw domyślną metodę płatności.'],
];

/**
 * Powód nieudanego auto-doładowania dla klienta (mail i panel). Surowy tekst od Stripe („No such PaymentMethod: pm_…”,
 * `status=…`) zostaje w bazie i audycie — klient dostaje zdanie po polsku. Idempotentne: własne komunikaty też pasują.
 */
export function powodAutoDoladowania(raw: string | null | undefined): string {
  const tekst = raw ?? '';
  return POWODY_AUTODOLADOWANIA.find(([wzor]) => wzor.test(tekst))?.[1] ?? 'Nie udało się pobrać płatności z karty. Sprawdź kartę lub doładuj portfel ręcznie.';
}

@Injectable()
export class WalletAutoTopupService {
  private readonly logger = new Logger(WalletAutoTopupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
    private readonly audit: AuditService,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {}

  async getForUser(userId: string) {
    const row = await this.prisma.walletAutoTopup.findUnique({ where: { userId } });
    return (
      row ?? {
        enabled: false,
        threshold: new Prisma.Decimal(50),
        topupAmount: new Prisma.Decimal(100),
        currency: 'PLN',
        paymentMethodId: null,
        cooldownUntil: null,
        lastAttemptAt: null,
        lastAttemptOk: null,
        lastAttemptError: null,
      }
    );
  }

  async upsertForUser(
    userId: string,
    dto: {
      enabled: boolean;
      thresholdPln: string;
      topupAmountPln: string;
      localPaymentMethodId: string | null;
    },
  ) {
    const threshold = new Prisma.Decimal(dto.thresholdPln);
    const topupAmount = new Prisma.Decimal(dto.topupAmountPln);

    if (threshold.lessThan(0)) {
      throw new BadRequestException('Próg nie może być ujemny.');
    }
    if (topupAmount.lessThanOrEqualTo(0) || topupAmount.greaterThan(10000)) {
      throw new BadRequestException('Kwota auto-doładowania musi być w (0, 10000].');
    }

    if (dto.enabled && dto.localPaymentMethodId) {
      const pm = await this.prisma.paymentMethod.findFirst({
        where: { id: dto.localPaymentMethodId, userId, provider: 'STRIPE' },
      });
      if (!pm) throw new BadRequestException('Wybrano nieistniejącą metodę płatności.');
    }

    return this.prisma.walletAutoTopup.upsert({
      where: { userId },
      create: {
        userId,
        enabled: dto.enabled,
        threshold,
        topupAmount,
        currency: 'PLN',
        paymentMethodId: dto.localPaymentMethodId ?? undefined,
      },
      update: {
        enabled: dto.enabled,
        threshold,
        topupAmount,
        paymentMethodId: dto.localPaymentMethodId ?? undefined,
      },
    });
  }

  /**
   * Evaluated periodically by `WalletAutoTopupScheduler`.
   */
  async runEligibleChecks(): Promise<void> {
    if (!this.stripe.isConfigured()) {
      return;
    }

    const now = new Date();
    const rules = await this.prisma.walletAutoTopup.findMany({
      where: {
        enabled: true,
        OR: [{ cooldownUntil: null }, { cooldownUntil: { lte: now } }],
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            walletBalance: true,
            walletCurrency: true,
            stripeCustomerId: true,
            defaultPaymentMethodId: true,
          },
        },
      },
    });

    for (const rule of rules) {
      try {
        await this.maybeTrigger(rule, null);
      } catch (err) {
        this.logger.warn(
          `auto-topup scheduling failed user=${rule.userId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  /**
   * F3.6 — „Ponów” na liście nieudanych płatności (Finanse/L4): ta sama ścieżka co harmonogram (próg, karta,
   * zajęcie reguły przed obciążeniem), tylko bez czekania na koniec karencji po błędzie. Wolno wyłącznie, gdy reguła
   * jest włączona, a ostatnia próba skończyła się błędem — nie w trakcie próby i nie przy płatności „w przetwarzaniu”
   * (mogłaby jeszcze wejść, a ponowienie obciążyłoby kartę drugi raz). Błąd karty = błąd dla operatora.
   */
  async ponowPoBledzie(userId: string): Promise<WynikProby> {
    if (!this.stripe.isConfigured()) throw new BadRequestException('Płatności kartą nie są skonfigurowane.');
    const rule = await this.prisma.walletAutoTopup.findUnique({
      where: { userId },
      include: { user: { select: { id: true, email: true, firstName: true, walletBalance: true, walletCurrency: true, stripeCustomerId: true, defaultPaymentMethodId: true } } },
    });
    if (!rule) throw new NotFoundException('Klient nie ma auto-doładowania.');
    const powod = powodBlokadyPonowienia(rule);
    if (powod) throw new ConflictException(powod);
    return this.maybeTrigger(rule, { poprzedniaProba: rule.lastAttemptAt });
  }

  private async maybeTrigger(
    rule: {
      userId: string;
      threshold: Prisma.Decimal;
      topupAmount: Prisma.Decimal;
      currency: string;
      paymentMethodId: string | null;
      user: {
        email: string;
        firstName: string | null;
        walletBalance: Prisma.Decimal;
        walletCurrency: string;
        stripeCustomerId: string | null;
        defaultPaymentMethodId: string | null;
      };
    },
    ponowienie: { poprzedniaProba: Date | null } | null,
  ): Promise<WynikProby> {
    if (rule.user.walletCurrency !== rule.currency) {
      return { wynik: 'pominieto', powod: 'Waluta portfela inna niż waluta reguły.' };
    }
    if (rule.user.walletBalance.gte(rule.threshold)) {
      return { wynik: 'pominieto', powod: 'Saldo jest już powyżej progu auto-doładowania.' };
    }
    if (!rule.user.stripeCustomerId) {
      return { wynik: 'pominieto', powod: 'Klient nie ma konta płatności kartą.' };
    }

    let stripePm = rule.user.defaultPaymentMethodId ?? null;
    if (rule.paymentMethodId) {
      const pmRow = await this.prisma.paymentMethod.findFirst({
        where: {
          userId: rule.userId,
          id: rule.paymentMethodId,
          provider: 'STRIPE',
        },
      });
      stripePm = pmRow?.providerRef ?? null;
    }

    if (!stripePm?.startsWith('pm_')) {
      await this.touchFailure(
        rule.userId,
        'Brak zapisanej karty — ustaw domyślną metodę płatności.',
        null,
        rule,
      );
      return { wynik: 'blad', powod: 'Brak zapisanej karty — ustaw domyślną metodę płatności.' };
    }

    const minor = Math.round(rule.topupAmount.toNumber() * 100);
    if (minor < 100) return { wynik: 'pominieto', powod: 'Kwota auto-doładowania poniżej 1 zł.' };

    // Zajęcie przed obciążeniem karty: dwa nakładające się przebiegi (albo dwie instancje API)
    // obciążały kartę dwa razy — klucz idempotencji Stripe scalał je tylko w tej samej godzinie,
    // a karencja zapisywała się dopiero po odpowiedzi Stripe. Wygrywa jeden przebieg.
    // F3.6 — `lastAttemptOk: null` = próba w toku (ponowienie z panelu jej nie dubluje). Ponowienie zajmuje regułę
    // warunkiem „ta sama nieudana próba, którą operator widział” — dwa kliknięcia albo dwóch operatorów: wygrywa jedno.
    const teraz = new Date();
    const zajete = await this.prisma.walletAutoTopup.updateMany({
      where: ponowienie
        ? { userId: rule.userId, enabled: true, lastAttemptOk: false, lastAttemptAt: ponowienie.poprzedniaProba }
        : { userId: rule.userId, enabled: true, OR: [{ cooldownUntil: null }, { cooldownUntil: { lte: teraz } }] },
      data: { cooldownUntil: new Date(teraz.getTime() + COOLDOWN_MS), lastAttemptAt: teraz, lastAttemptOk: null },
    });
    if (zajete.count === 0) return { wynik: 'pominieto', powod: 'Inna próba właśnie trwa — odśwież listę.' };

    // Ponowienie ma własny klucz Stripe: klucz godzinowy zwróciłby zapamiętaną odmowę z poprzedniej próby.
    const piIdempotencyKey = ponowienie
      ? `auto-topup:intent:${rule.userId}:ponowienie:${teraz.getTime()}`
      : `auto-topup:intent:${rule.userId}:${Math.floor(teraz.getTime() / COOLDOWN_MS)}`;

    try {
      const pi = await this.stripe.createOffSessionPaymentIntent({
        customerId: rule.user.stripeCustomerId,
        stripePaymentMethodId: stripePm,
        amountMinor: minor,
        currency: rule.currency,
        metadata: {
          verris_kind: 'wallet_auto_topup',
          verris_user_id: rule.userId,
        },
        idempotencyKey: piIdempotencyKey,
      });

      await this.prisma.walletAutoTopup.update({
        where: { userId: rule.userId },
        data: {
          lastAttemptAt: new Date(),
          lastAttemptOk: pi.status === 'succeeded',
          lastAttemptError: pi.status === 'succeeded' ? null : `status=${pi.status}`,
          cooldownUntil: new Date(Date.now() + COOLDOWN_MS),
        },
      });

      if (pi.status === 'requires_action') {
        const powod = 'Karta wymaga dodatkowej autoryzacji (3DS) — zmień metodę płatności lub doładuj przez Checkout.';
        await this.touchFailure(rule.userId, powod, pi.id, rule);
        return { wynik: 'blad', powod };
      }
      return { wynik: 'zlecono', status: pi.status, paymentIntentId: pi.id };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.touchFailure(rule.userId, msg, null, rule);
      return { wynik: 'blad', powod: msg };
    }
  }

  private async touchFailure(
    userId: string,
    msg: string,
    stripeRef?: string | null,
    rule?: { topupAmount: Prisma.Decimal; user: { email: string; firstName: string | null } },
  ) {
    await this.prisma.walletAutoTopup.updateMany({
      where: { userId },
      data: {
        lastAttemptAt: new Date(),
        lastAttemptOk: false,
        lastAttemptError: msg.slice(0, 2000),
        cooldownUntil: new Date(Date.now() + COOLDOWN_MS),
      },
    });
    await this.audit.record({
      action: 'WALLET_AUTO_TOPUP_FAILED',
      userId,
      details: { message: msg.slice(0, 500), stripeRef: stripeRef ?? null },
    });
    if (rule?.user.email) {
      const panelUrl = (this.config.get<string>('clientPanelUrl') ?? 'https://panel.verris.pl').replace(
        /\/$/,
        '',
      );
      const tpl = walletAutoTopupFailedTemplate({
        to: rule.user.email,
        firstName: rule.user.firstName,
        reason: powodAutoDoladowania(msg),
        topupAmountPln: rule.topupAmount.toFixed(2),
        panelUrl,
      });
      await this.mailer.send({
        ...tpl,
        userId,
        category: 'TRANSACTIONAL',
        fromRole: 'BILLING',
      });
    }
  }
}

