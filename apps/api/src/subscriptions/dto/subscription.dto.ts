import {
  Equals,
  IsBoolean,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { BillingInterval, SubscriptionPaymentSource } from '@verris/database';

/**
 * Z-02 — źródła płatności, które wolno wskazać KLIENTOWI przy zakładaniu usługi.
 *
 * `MANUAL` jest tu świadomie pominięty. To ścieżka operatorska (konta gratisowe,
 * bug bounty), która uruchamia usługę BEZ obciążenia i BEZ faktury —
 * `SubscriptionsService.provisionWithoutCharge`. Wystawiona na endpoincie klienta
 * pozwalała dowolnemu zarejestrowanemu kontu zamówić nieograniczoną liczbę
 * aktywnych usług za 0 zł. Ta sama luka była już zamknięta przy zmianie planu
 * (`plan-change.service.ts:206-213`), ale nie przy zakupie.
 *
 * Enum w bazie zostaje bez zmian — istniejące subskrypcje MANUAL są nadal
 * obsługiwane, a operator może je zakładać po jawnym `allowManual`.
 */
export const CLIENT_PAYMENT_SOURCES: readonly SubscriptionPaymentSource[] = [
  SubscriptionPaymentSource.STRIPE_CARD,
  SubscriptionPaymentSource.WALLET,
];

/** Konwersja triala na plan płatny — wymaga oświadczenia konsumenckiego. */
export class ConvertTrialDto {
  @IsBoolean()
  @Equals(true, {
    message:
      'Wymagane jest oświadczenie o żądaniu rozpoczęcia świadczenia usługi przed upływem terminu odstąpienia od umowy.',
  })
  immediatePerformanceConsent!: boolean;
}

export class CreateSubscriptionDto {
  @IsUUID()
  planId!: string;

  /**
   * Oświadczenie konsumenckie: żądanie rozpoczęcia świadczenia przed upływem
   * 14-dniowego terminu odstąpienia (art. 15 ust. 3 i art. 21 ust. 2 ustawy
   * o prawach konsumenta; Regulamin §4 ust. 4). Bez `true` zamówienie jest
   * odrzucane; fakt złożenia oświadczenia trafia do dziennika audytu (dowód).
   */
  @IsBoolean()
  @Equals(true, {
    message:
      'Wymagane jest oświadczenie o żądaniu rozpoczęcia świadczenia usługi przed upływem terminu odstąpienia od umowy.',
  })
  immediatePerformanceConsent!: boolean;

  @IsEnum(BillingInterval)
  interval!: BillingInterval;

  /**
   * Source of payment for this subscription's recurring charges.
   * Z-02: klient może wskazać wyłącznie `CLIENT_PAYMENT_SOURCES` — `MANUAL`
   * jest zarezerwowane dla operatora.
   */
  @IsEnum(SubscriptionPaymentSource)
  @IsIn(CLIENT_PAYMENT_SOURCES, {
    message: 'Niedozwolone źródło płatności dla zamówienia klienta.',
  })
  paymentSource!: SubscriptionPaymentSource;

  /**
   * Primary domain that will be created in DirectAdmin. Required for hosting /
   * e-mail products; ignored for app-level products (EMAIL_MARKETING), which
   * activate without a DA account. Walidacja obecności jest w serwisie wg planu.
   */
  @IsOptional()
  @IsString()
  @Length(4, 253)
  @Matches(/^[a-z0-9.-]+\.[a-z]{2,}$/i, { message: 'Niepoprawny format domeny' })
  domain?: string;

  /** Optional region preference (e.g. "PL-WAW"). Used as a tie-breaker. */
  @IsOptional()
  @IsString()
  preferredRegion?: string;

  /** Whether autoscaling is enabled at sign-up. Default false. */
  @IsOptional()
  @IsBoolean()
  autoscalingEnabled?: boolean;

  /** Whether eco mode is enabled at sign-up. Default false. */
  @IsOptional()
  @IsBoolean()
  ecoModeEnabled?: boolean;

  /** Rabat procentowy na usługę (tylko płatność z portfela). */
  @IsOptional()
  @IsString()
  @Length(3, 40)
  promoCode?: string;

  /**
   * Przy `paymentSource: WALLET`: `PAYNOW` — klient płaci za tę usługę od razu BLIK-iem lub przelewem (Paynow),
   * dokument za wpłatę nazywa usługę i okres; odnowienia dalej z portfela. Brak / `PORTFEL` — obciążenie salda.
   */
  @IsOptional()
  @IsIn(['PORTFEL', 'PAYNOW'], { message: 'Niedozwolony sposób opłaty.' })
  oplata?: 'PORTFEL' | 'PAYNOW';

  /**
   * 14.10 — identyfikator klienta GA4 (`<losowa>.<znacznik czasu>` z ciasteczka `_ga`), wysyłany przez panel tylko
   * przy zgodzie na analitykę. Przy płatności kartą klient nie wraca do panelu, więc `purchase` wysyła serwer
   * (Measurement Protocol) po potwierdzeniu płatności — z tym identyfikatorem, żeby zakup trafił do jego sesji.
   */
  @IsOptional()
  @IsString()
  @Matches(/^\d{1,20}\.\d{1,20}$/, { message: 'Niepoprawny identyfikator klienta GA4.' })
  gaClientId?: string;
}

export class PreviewSubscriptionPromoDto {
  @IsUUID()
  planId!: string;

  @IsEnum(BillingInterval)
  interval!: BillingInterval;

  @IsString()
  @Length(3, 40)
  code!: string;
}

export class SuspendSubscriptionDto {
  @IsString()
  @Length(2, 60)
  reason!: string;

  /** Notatka do dziennika; dla pracownika obsługi — obowiązkowy powód (D2, min. 10 znaków). */
  @IsOptional()
  @IsString()
  @Length(1, 500)
  note?: string;

  /** F2.3 (D2) — numer zgłoszenia klienta (#ab12cd34 albo pełne id). */
  @IsOptional()
  @IsString()
  @Length(1, 64)
  zgloszenie?: string;
}

export class UnsuspendSubscriptionDto {
  @IsOptional()
  @IsString()
  @Length(1, 500)
  note?: string;

  @IsOptional()
  @IsBoolean()
  chargeRenewal?: boolean;

  /** F2.3 (D2) — numer zgłoszenia klienta (#ab12cd34 albo pełne id). */
  @IsOptional()
  @IsString()
  @Length(1, 64)
  zgloszenie?: string;
}

/** Operator: zakończ usługę i usuń konto od razu. Powód do audytu, potwierdzenie = domena konta. */
export class ZakonczIUsunDto {
  @IsString()
  @Length(3, 500)
  powod!: string;

  @IsString()
  @Length(1, 253)
  potwierdzenie!: string;
}

export class CancelSubscriptionDto {
  /**
   * When true (default), the subscription stays active until the end of the
   * already-paid period and Stripe is told to cancel at period end (no further
   * charges). When false, we cancel immediately and tear down the hosting now.
   */
  @IsOptional()
  @IsBoolean()
  atPeriodEnd?: boolean;
}

export class UpdateAutoscalingDto {
  @IsBoolean()
  enabled!: boolean;

  /** Monthly cap in PLN. Set to 0 to mean "no cap" (cap will be enforced
   *  by the engine refusing to scale once reached). */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99_999.99)
  maxMonthlyCost?: number;

  @IsOptional()
  @IsBoolean()
  scaleCpu?: boolean;

  @IsOptional()
  @IsBoolean()
  scaleRam?: boolean;

  @IsOptional()
  @IsBoolean()
  scaleDisk?: boolean;
}

export class UpdateSubscriptionPreferencesDto {
  @IsBoolean()
  ecoModeEnabled!: boolean;
}
