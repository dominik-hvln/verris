import { CustomerPermission } from '@verris/database';
/** API-1 — katalog uprawnień (scopes) tokenów publicznego API klienta. */
export const API_SCOPES = {
  SERVICES_READ: 'services:read',
  BILLING_READ: 'billing:read',
  INVOICES_READ: 'invoices:read',
  DNS_READ: 'dns:read',
  DNS_WRITE: 'dns:write',
  DEPLOY_WRITE: 'deploy:write',
  MAIL_READ: 'mail:read',
  MAIL_WRITE: 'mail:write',
  ORDERS_WRITE: 'orders:write',
} as const;

export type ApiScopeValue = (typeof API_SCOPES)[keyof typeof API_SCOPES];

export const ALL_API_SCOPES: ApiScopeValue[] = Object.values(API_SCOPES);

export const API_SCOPE_LABELS: Record<ApiScopeValue, string> = {
  'services:read': 'Odczyt usług (lista i szczegóły)',
  'billing:read': 'Odczyt portfela i salda',
  'invoices:read': 'Odczyt faktur',
  'dns:read': 'Odczyt rekordów DNS',
  'dns:write': 'Dodawanie i usuwanie rekordów DNS (np. Terraform, certyfikaty DNS-01)',
  'deploy:write': 'Wdrożenie: pobranie zmian z repozytorium Git (CI/CD)',
  'mail:read': 'Odczyt skrzynek pocztowych (adresy i rozmiary)',
  'mail:write': 'Zakładanie i usuwanie skrzynek, zmiana hasła i rozmiaru',
  'orders:write': 'Zamawianie usług z salda portfela (obciąża konto)',
};

export function isValidScope(s: string): s is ApiScopeValue {
  return (zakresyDostepne() as string[]).includes(s);
}

/**
 * Zakresy, które klient może dziś nadać tokenowi. `orders:write` dopiero po włączeniu zamówień przez API
 * (`API_ZAMOWIENIA=1`, decyzja właściciela) — inaczej panel pokazywałby uprawnienie do trasy, która odpowiada 404.
 */
export function zakresyDostepne(): ApiScopeValue[] {
  return ALL_API_SCOPES.filter((z) => z !== API_SCOPES.ORDERS_WRITE || process.env.API_ZAMOWIENIA === '1');
}

/**
 * Subkonto może nadać tokenowi tylko zakres, którego samo ma odpowiednik w uprawnieniach —
 * inaczej SETTINGS_MANAGE wystarczałoby, żeby przez API zrobić to, czego w panelu mu nie wolno.
 */
export const UPRAWNIENIE_ZAKRESU: Record<ApiScopeValue, CustomerPermission> = {
  'services:read': CustomerPermission.SERVICES_READ,
  'billing:read': CustomerPermission.BILLING_READ,
  'invoices:read': CustomerPermission.BILLING_READ,
  'dns:read': CustomerPermission.DNS_MANAGE,
  'dns:write': CustomerPermission.DNS_MANAGE,
  'deploy:write': CustomerPermission.FILES_MANAGE,
  'mail:read': CustomerPermission.EMAIL_MANAGE,
  'mail:write': CustomerPermission.EMAIL_MANAGE,
  'orders:write': CustomerPermission.BILLING_MANAGE,
};
