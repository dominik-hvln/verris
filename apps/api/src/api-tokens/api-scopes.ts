/** API-1 — katalog uprawnień (scopes) tokenów publicznego API klienta. */
export const API_SCOPES = {
  SERVICES_READ: 'services:read',
  BILLING_READ: 'billing:read',
  INVOICES_READ: 'invoices:read',
  DNS_READ: 'dns:read',
  DNS_WRITE: 'dns:write',
  DEPLOY_WRITE: 'deploy:write',
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
};

export function isValidScope(s: string): s is ApiScopeValue {
  return (ALL_API_SCOPES as string[]).includes(s);
}
