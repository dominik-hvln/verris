export const PERMISSION_LABELS: Record<string, string> = {
  BILLING_READ: 'Płatności: podgląd',
  BILLING_MANAGE: 'Płatności: zarządzanie',
  SERVICES_READ: 'Usługi: podgląd',
  SERVICES_MANAGE: 'Usługi: zarządzanie',
  DOMAINS_READ: 'Domeny: podgląd',
  DOMAINS_MANAGE: 'Domeny: zarządzanie',
  DNS_MANAGE: 'DNS: zarządzanie',
  EMAIL_MANAGE: 'Poczta: zarządzanie',
  FILES_MANAGE: 'Pliki: zarządzanie',
  TICKETS_READ: 'Tickety: podgląd',
  TICKETS_MANAGE: 'Tickety: zarządzanie',
  SETTINGS_MANAGE: 'Ustawienia konta',
};

/** P3-05 — co uprawnienie daje, prostym językiem; widoczne na stałe pod nazwą w pickerze. */
export const PERMISSION_DESCRIPTIONS: Record<string, string> = {
  BILLING_READ: 'Saldo portfela, historia płatności, faktury.',
  BILLING_MANAGE: 'Doładowania i zakupy opłacane z Twojego portfela.',
  SERVICES_READ: 'Lista usług i ich stan, bez zmian.',
  SERVICES_MANAGE: 'Ustawienia usług. Rezygnacja z usługi zostaje u Ciebie.',
  DOMAINS_READ: 'Lista domen i terminy odnowienia.',
  DOMAINS_MANAGE: 'Zmiany w domenach. Kod transferu i dane abonenta zostają u Ciebie.',
  DNS_MANAGE: 'Podgląd i zmiana rekordów DNS.',
  EMAIL_MANAGE: 'Skrzynki, przekierowania i logowanie do poczty w przeglądarce.',
  FILES_MANAGE: 'Pliki stron, bazy danych, kopie, FTP i SSH.',
  TICKETS_READ: 'Podgląd zgłoszeń do pomocy.',
  TICKETS_MANAGE: 'Zakładanie zgłoszeń i odpowiedzi.',
  SETTINGS_MANAGE: 'Tokeny API, webhooki i ustawienia konta.',
};

/** Konto usunięte na wniosek (RODO) ma zanonimizowany e-mail — pokazujemy etykietę, nie „deleted-<uuid>@verris.local”. */
export const pokazEmail = (email: string | null | undefined): string =>
  email && /^deleted-[0-9a-f-]+@verris\.local$/i.test(email) ? 'Konto usunięte' : (email ?? '');

/** Ciasteczko z komunikatem błędu formularza IAM (strona czyta je, gdy w adresie jest notice=blad). */
export const CIASTECZKO_BLEDU_IAM = 'iam_blad';
