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

/**
 * Nazwa wpisu portfela z uwzględnieniem znaku: ADJUSTMENT to zarówno uznanie od Verris, jak i obciążenie
 * (cofnięcie doładowania po zwrocie, ręczna korekta) — „Uznanie” przy −25 K myliło (t1 05.10).
 */
export function etykietaWpisuPortfela(type: string, amount: string | number): string {
  if (type === 'ADJUSTMENT' && Number(amount) < 0) return 'Korekta salda';
  return (WALLET_TX_TYPE_PL as Record<string, string>)[type] ?? type;
}

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
  // F3.5 — cykl życia usługi zmieniany przez obsługę.
  CANCEL_REVOKED: 'Rezygnacja cofnięta',
  RENEWAL_DATE_CHANGED: 'Zmieniono datę odnowienia',
  PAYMENT_PROMISE: 'Wstrzymano zawieszenie do terminu płatności',
  OPLACONE_NIEURUCHOMIONE: 'Płatność przyjęta — uruchomienie usługi sprawdza obsługa',
  OKRES_OPLACONY_U_POPRZEDNIEGO: 'Usługa przeniesiona z okresem opłaconym u poprzedniego usługodawcy',
  PAYMENT_PROMISE_REVOKED: 'Odwołano wstrzymanie zawieszenia',
  // K2 (PB-53.5) — administrator przeniósł usługę na inne konto; oś widzi tylko obecny właściciel.
  OWNER_CHANGED: 'Zmiana właściciela usługi',
  // Weryfikacja 11.10 (D3, 10.10) — działania obsługi na usłudze widoczne dla klienta bez nazwiska operatora i bez
  // powodu. Etykiety z liczbą/nazwą (limit, dodatek) składa panel klienta ze szczegółów (lib/service-events.ts).
  MAIL_SENDING_BLOCKED: 'Obsługa Verris zablokowała wysyłkę poczty z konta',
  MAIL_SENDING_UNBLOCKED: 'Obsługa Verris przywróciła wysyłkę poczty z konta',
  MAIL_SEND_LIMIT_CHANGED: 'Obsługa Verris zmieniła dobowy limit wysyłki poczty',
  ADDON_ADDED: 'Obsługa Verris dodała dodatek',
  // K3 — limity indywidualne usługi (bez słowa „custom” i nazw infrastruktury).
  LIMITS_CUSTOMIZED: 'Obsługa Verris ustaliła indywidualne limity usługi',
  LIMITS_RESET: 'Obsługa Verris przywróciła limity planu',
  CANCELED: 'Usługa anulowana',
  EXPIRED: 'Usługa wygasła',
  RESELLER_MARKUP_REMOVED: 'Cena bez narzutu partnera',
  TRIAL_STARTED: 'Start okresu próbnego',
  TRIAL_CONVERTED: 'Okres próbny zamieniony na płatny',
  TRIAL_EXPIRED: 'Koniec okresu próbnego',
  PROVISIONING_FAILED: 'Zakładanie konta wymaga uwagi',
  AUTOSCALING_ENABLED: 'Włączono autoskalowanie',
  AUTOSCALING_DISABLED: 'Wyłączono autoskalowanie',
  MIGRATION_EXTERNAL_REQUESTED: 'Zlecono przeniesienie strony do Verris',
  MIGRATION_INTERNAL_REQUESTED: 'Zlecono przeniesienie konta na inny serwer',
  MIGRATION_EXTERNAL_QUEUED: 'Przenoszenie strony przyjęte',
  MIGRATION_INTERNAL_QUEUED: 'Przenoszenie konta przyjęte',
  MIGRATION_EXTERNAL_FAILED: 'Przenoszenie strony wymaga uwagi',
  MIGRATION_INTERNAL_FAILED: 'Przenoszenie konta wymaga uwagi',
  MIGRATION_BUNDLE_QUEUED: 'Rozpoczęto przenoszenie strony',
  MIGRATION_BUNDLE_COMPLETED: 'Strona przeniesiona',
  MIGRATION_BUNDLE_FAILED: 'Przenoszenie strony zatrzymane',
  MIGRATION_ESCALATED: 'Przenoszenie dokończy nasz zespół',
  MIGRATION_CANCELED: 'Przenoszenie anulowane',
  // PB-45 — migracja przygotowana przez obsługę, start dopiero po zgodzie klienta.
  MIGRATION_CONSENT_REQUESTED: 'Przygotowaliśmy przeniesienie strony — czeka na Twoją zgodę',
  MIGRATION_CONSENT_REJECTED: 'Odrzucono przygotowane przeniesienie strony',
  MIGRATION_CONSENT_EXPIRED: 'Prośba o zgodę na przeniesienie wygasła',
  MIGRATION_DELTA_SYNC_QUEUED: 'Dogrywamy najnowsze pliki i pocztę',
  MIGRATION_CUTOVER_DNS_APPLIED: 'Domena przełączona na Verris',
  MIGRATION_WORKER_JOB_RETRYING: 'Migracja: ponowienie kroku (wewnętrzne)',
  MIGRATION_WORKER_JOB_COMPLETED: 'Migracja: krok zakończony (wewnętrzne)',
  MIGRATION_ATTENTION_NOTIFIED: 'Migracja: klient powiadomiony o zatrzymaniu',
  MIGRATION_SECRETS_EXPIRING: 'Migracja: hasła źródła wkrótce wygasną (przypomnienie dla zespołu)',
};

/** Etykieta albo — gdy mapa nie zna wartości — sam kod, żeby nic nie zniknęło z ekranu. */
export function etykieta(mapa: Record<string, string>, kod: string | null | undefined): string {
  if (!kod) return '—';
  return mapa[kod] ?? kod;
}

/**
 * Przyrostek domeny usuniętego konta („<domena>~usuniete-<id konta>”) — dopisuje go `zwolnionaDomena`
 * (apps/api/src/compliance/account-deletion.service.ts) i migracja 20260929120000, żeby zwolnić unikalność domeny.
 */
const PRZYROSTEK_USUNIETEGO_KONTA = '~usuniete-';

/**
 * Domena usługi do wyświetlenia: „z18b.pl~usuniete-<uuid>” → „z18b.pl (usunięta)” (weryfikacja na prod 12.10 —
 * panele obsługi pokazywały techniczny przyrostek). Tylko etykieta — w bazie, w parametrach akcji i w porównaniach
 * zostaje surowa wartość. Inne domeny (i null) bez zmian.
 */
export function domenaDoWyswietlenia(domena: string): string;
export function domenaDoWyswietlenia(domena: string | null | undefined): string | null | undefined;
export function domenaDoWyswietlenia(domena: string | null | undefined): string | null | undefined {
  if (!domena) return domena;
  const i = domena.indexOf(PRZYROSTEK_USUNIETEGO_KONTA);
  return i > 0 ? `${domena.slice(0, i)} (usunięta)` : domena;
}
