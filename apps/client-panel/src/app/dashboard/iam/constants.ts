export const IAM_AUDIT_ACTION_LABELS: Record<string, string> = {
  CUSTOMER_IAM_INVITE_CREATED: 'Wysłano zaproszenie',
  CUSTOMER_IAM_INVITE_ACCEPTED: 'Subkonto aktywowane',
  CUSTOMER_IAM_INVITE_REVOKED: 'Zaproszenie odwołane',
  CUSTOMER_IAM_MEMBER_UPDATED: 'Zmiana uprawnień',
  CUSTOMER_IAM_MEMBER_DISABLED: 'Subkonto wyłączone',
};

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
