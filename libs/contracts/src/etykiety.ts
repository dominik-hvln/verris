import type { InvoiceStatus } from './invoice.dto.ts';
import type { WalletTxStatus, WalletTxType } from './wallet.dto.ts';

/**
 * Etykiety enumów z bazy po polsku — jedno źródło dla panelu klienta i panelu
 * obsługi. Zasada „nic nie może się ukrywać przed klientem” działa też w drugą
 * stronę: nikt nie powinien czytać `CHARGE_SUBSCRIPTION (COMPLETED)`.
 *
 * `Record<Typ, string>` tam, gdzie typ istnieje w kontraktach — nowa wartość
 * enumu bez etykiety kończy się błędem kompilacji, nie surowym kodem na ekranie.
 * Strażnik `etykiety-pokrywaja-enumy.spec.ts` porównuje mapy z `schema.prisma`.
 */

export const WALLET_TX_TYPE_PL: Record<WalletTxType, string> = {
  TOPUP: 'Doładowanie portfela',
  REFUND: 'Zwrot środków',
  CHARGE_SUBSCRIPTION: 'Opłata za usługę',
  CHARGE_PLAN_UPGRADE: 'Zmiana planu na wyższy (dopłata)',
  CREDIT_PLAN_DOWNGRADE: 'Zmiana planu na niższy (zwrot różnicy)',
  CHARGE_AUTOSCALING: 'Autoskalowanie',
  CHARGE_USAGE: 'Wykorzystanie zasobów',
  CHARGE_DOMAIN: 'Domena',
  ADJUSTMENT: 'Uznanie od Verris',
  PROMO_CREDIT: 'Kod promocyjny',
  COMMISSION_CREDIT: 'Prowizja partnerska',
};

export const WALLET_TX_STATUS_PL: Record<WalletTxStatus, string> = {
  PENDING: 'w toku',
  COMPLETED: 'zaksięgowana',
  FAILED: 'nieudana',
  REFUNDED: 'zwrócona',
};

export const INVOICE_STATUS_PL: Record<InvoiceStatus, string> = {
  DRAFT: 'Szkic',
  OPEN: 'Do zapłaty',
  PAID: 'Opłacona',
  VOID: 'Anulowana',
  UNCOLLECTIBLE: 'Nieściągalna',
};

export const SUBSCRIPTION_STATUS_PL: Record<string, string> = {
  PENDING_PAYMENT: 'Czeka na płatność',
  PROVISIONING: 'Zakładanie',
  ACTIVE: 'Aktywna',
  PAST_DUE: 'Zaległa płatność',
  SUSPENDED: 'Zawieszona',
  CANCELED: 'Anulowana',
  EXPIRED: 'Wygasła',
};

export const BILLING_INTERVAL_PL: Record<string, string> = {
  MONTH: 'Miesięcznie',
  YEAR: 'Rocznie',
};

export const DOMAIN_STATUS_PL: Record<string, string> = {
  PENDING: 'W trakcie',
  ACTIVE: 'Aktywna',
  EXPIRED: 'Wygasła',
};

export const TICKET_STATUS_PL: Record<string, string> = {
  OPEN: 'Otwarte',
  IN_PROGRESS: 'W realizacji',
  WAITING_CUSTOMER: 'Czeka na klienta',
  CLOSED: 'Zamknięte',
};

export const TICKET_PRIORITY_PL: Record<string, string> = {
  LOW: 'Niski',
  NORMAL: 'Normalny',
  HIGH: 'Wysoki',
  URGENT: 'Pilny',
};

export const TICKET_DEPARTMENT_PL: Record<string, string> = {
  BILLING: 'Płatności',
  TECHNICAL: 'Techniczny',
  SALES: 'Sprzedaż',
};

/** Zdarzenia usługi (`SubscriptionEvent.type`) — przegląd usługi, historia, obsługa. */
export const SERVICE_EVENT_PL: Record<string, string> = {
  CREATED: 'Usługa zamówiona',
  PROVISIONING_INTENT: 'Zaczęliśmy zakładać konto',
  ACCOUNT_PROVISIONED: 'Konto hostingowe gotowe',
  ACTIVATED: 'Usługa aktywna',
  RENEWED: 'Usługa odnowiona',
  PLAN_CHANGED: 'Zmieniono plan',
  PAYMENT_FAILED: 'Płatność nie przeszła',
  PAYMENT_RECOVERED: 'Płatność uregulowana',
  SUSPENDED: 'Usługa zawieszona',
  UNSUSPENDED: 'Usługa odwieszona',
  CANCEL_SCHEDULED: 'Zaplanowano rezygnację',
  CANCELED: 'Usługa anulowana',
  TRIAL_STARTED: 'Start okresu próbnego',
  TRIAL_CONVERTED: 'Okres próbny zamieniony na płatny',
  TRIAL_EXPIRED: 'Koniec okresu próbnego',
  PROVISIONING_FAILED: 'Zakładanie konta wymaga uwagi',
};

/** Etykieta albo — gdy mapa nie zna wartości — sam kod, żeby nic nie zniknęło z ekranu. */
export function etykieta(mapa: Record<string, string>, kod: string | null | undefined): string {
  if (!kod) return '—';
  return mapa[kod] ?? kod;
}
