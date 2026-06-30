/**
 * RBAC — katalog granularnych uprawnień panelu admina/staff.
 * Trzymany w kodzie (nie enum DB), by dodanie nowego uprawnienia nie wymagało
 * migracji. Role (StaffRole.permissions) przechowują te klucze jako stringi.
 */
export const STAFF_PERMISSIONS = [
  { key: 'DASHBOARD_VIEW', area: 'Ogólne', label: 'Pulpit i metryki biznesowe' },
  { key: 'CUSTOMERS_VIEW', area: 'Klienci', label: 'Podgląd klientów' },
  { key: 'CUSTOMERS_MANAGE', area: 'Klienci', label: 'Zarządzanie klientami (edycja, blokady)' },
  { key: 'SUBSCRIPTIONS_MANAGE', area: 'Usługi', label: 'Subskrypcje i usługi' },
  { key: 'TICKETS_VIEW', area: 'Wsparcie', label: 'Podgląd zgłoszeń' },
  { key: 'TICKETS_MANAGE', area: 'Wsparcie', label: 'Obsługa zgłoszeń (odpowiedzi, status)' },
  { key: 'BILLING_VIEW', area: 'Finanse', label: 'Podgląd faktur i rozliczeń' },
  { key: 'BILLING_MANAGE', area: 'Finanse', label: 'Faktury, korekty, portfel, kredyty' },
  { key: 'NODES_VIEW', area: 'Infrastruktura', label: 'Podgląd węzłów i floty' },
  { key: 'NODES_MANAGE', area: 'Infrastruktura', label: 'Zarządzanie węzłami (cordon, drain, zadania)' },
  { key: 'PLANS_MANAGE', area: 'Infrastruktura', label: 'Plany produktowe i VPS' },
  { key: 'PROVISIONING_MANAGE', area: 'Operacje', label: 'Kolejka provisioningu' },
  { key: 'MIGRATIONS_MANAGE', area: 'Operacje', label: 'Migracje (cockpit)' },
  { key: 'PROMO_MANAGE', area: 'Marketing', label: 'Kody promocyjne i program partnerski' },
  { key: 'ABUSE_MANAGE', area: 'Bezpieczeństwo', label: 'Nadużycia / abuse' },
  { key: 'AUDIT_VIEW', area: 'Bezpieczeństwo', label: 'Logi bezpieczeństwa (audyt)' },
  { key: 'COMPLIANCE_MANAGE', area: 'Bezpieczeństwo', label: 'Compliance / RODO' },
  { key: 'SETTINGS_MANAGE', area: 'Administracja', label: 'Ustawienia platformy' },
  { key: 'STAFF_MANAGE', area: 'Administracja', label: 'Operatorzy, role i uprawnienia' },
] as const;

export type StaffPermission = (typeof STAFF_PERMISSIONS)[number]['key'];

export const STAFF_PERMISSION_KEYS: StaffPermission[] = STAFF_PERMISSIONS.map((p) => p.key);

export function isValidStaffPermission(key: string): key is StaffPermission {
  return STAFF_PERMISSION_KEYS.includes(key as StaffPermission);
}
