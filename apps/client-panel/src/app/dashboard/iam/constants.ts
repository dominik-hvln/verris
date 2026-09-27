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

/** Konto usunięte na wniosek (RODO) ma zanonimizowany e-mail — pokazujemy etykietę, nie „deleted-<uuid>@verris.local”. */
export const pokazEmail = (email: string | null | undefined): string =>
  email && /^deleted-[0-9a-f-]+@verris\.local$/i.test(email) ? 'Konto usunięte' : (email ?? '');

/** Ciasteczko z komunikatem błędu formularza IAM (strona czyta je, gdy w adresie jest notice=blad). */
export const CIASTECZKO_BLEDU_IAM = 'iam_blad';
