/**
 * RBAC — katalog granularnych uprawnień panelu admina/staff.
 * Trzymany w kodzie (nie enum DB), by dodanie nowego uprawnienia nie wymagało
 * migracji. Role (StaffRole.permissions) przechowują te klucze jako stringi.
 */
export const STAFF_PERMISSIONS = [
  { key: 'DASHBOARD_VIEW', area: 'Ogólne', label: 'Pulpit i metryki biznesowe' },
  { key: 'CUSTOMERS_VIEW', area: 'Klienci', label: 'Podgląd klientów' },
  { key: 'CUSTOMERS_MANAGE', area: 'Klienci', label: 'Zarządzanie klientami (edycja, blokady)' },
  { key: 'CUSTOMERS_IMPERSONATE', area: 'Klienci', label: 'Wejście na konto klienta („Zaloguj jako klient”, z powodem, 30 min)' },
  { key: 'CUSTOMERS_INTERNAL_FLAG', area: 'Klienci', label: 'Oznaczanie konta jako wewnętrzne (poza MRR i churnem)' },
  { key: 'SUBSCRIPTIONS_MANAGE', area: 'Usługi', label: 'Subskrypcje i usługi' },
  // F2.3 (D2, 10.10) — zawieszenie odcina stronę i pocztę klienta: L3 bezpośrednio, niżej przez wniosek.
  { key: 'SUBSCRIPTIONS_SUSPEND', area: 'Usługi', label: 'Zawieszanie i odwieszanie usług (odcina stronę i pocztę klienta)' },
  { key: 'TICKETS_VIEW', area: 'Wsparcie', label: 'Podgląd zgłoszeń' },
  { key: 'TICKETS_MANAGE', area: 'Wsparcie', label: 'Obsługa zgłoszeń (odpowiedzi, status)' },
  { key: 'REQUESTS_APPROVE', area: 'Obsługa', label: 'Akceptacja wniosków o operację' },
  { key: 'BILLING_VIEW', area: 'Finanse', label: 'Podgląd faktur i rozliczeń' },
  { key: 'BILLING_MANAGE', area: 'Finanse', label: 'Faktury, korekty, portfel, kredyty' },
  { key: 'NODES_VIEW', area: 'Infrastruktura', label: 'Podgląd węzłów i floty' },
  { key: 'NODES_MANAGE', area: 'Infrastruktura', label: 'Zarządzanie węzłami (cordon, drain, zadania)' },
  { key: 'PLANS_MANAGE', area: 'Infrastruktura', label: 'Podgląd planów produktowych (zmiany planów i cen — tylko administrator)' },
  { key: 'PROVISIONING_MANAGE', area: 'Operacje', label: 'Kolejka provisioningu' },
  { key: 'MIGRATIONS_MANAGE', area: 'Operacje', label: 'Migracje (cockpit)' },
  { key: 'CUSTOM_TERMS_MANAGE', area: 'Finanse', label: 'Indywidualne warunki: własna cena usługi, rabat autoskalowania, rozliczenie poza Verris' },
  { key: 'PROMO_MANAGE', area: 'Marketing', label: 'Kody promocyjne i program partnerski' },
  { key: 'KB_MANAGE', area: 'Marketing', label: 'Baza wiedzy: dodawanie, edycja i usuwanie artykułów i kategorii' },
  { key: 'ABUSE_MANAGE', area: 'Bezpieczeństwo', label: 'Nadużycia / abuse' },
  { key: 'AUDIT_VIEW', area: 'Bezpieczeństwo', label: 'Logi bezpieczeństwa (audyt)' },
  { key: 'COMPLIANCE_MANAGE', area: 'Bezpieczeństwo', label: 'Compliance / RODO' },
  { key: 'SETTINGS_MANAGE', area: 'Administracja', label: 'Ustawienia platformy' },
  { key: 'STAFF_MANAGE', area: 'Administracja', label: 'Operatorzy, role i uprawnienia' },
  // F2.4 — eksport list klientów i usług do CSV (dane osobowe; każdy eksport w dzienniku).
  { key: 'EXPORT_DATA', area: 'Klienci', label: 'Eksport list do CSV: klienci, usługi, faktury i transakcje portfela (dane osobowe, w dzienniku)' },
  { key: 'ACCOUNT_DIAGNOSTICS_VIEW', area: 'Wsparcie', label: 'Podgląd konta klienta: domeny, DNS, poczta, bazy, PHP, SSL, cron, logi (tylko odczyt, w dzienniku)' },
  // F2.2 (D2, 10.10) — odwracalne akcje na koncie klienta z karty usługi, bez wchodzenia na konto; powód w dzienniku.
  { key: 'ACCOUNT_ACTIONS', area: 'Wsparcie', label: 'Akcje na koncie klienta: reset haseł (klient ustawia nowe), SSL, PHP, kopia, skan (z powodem, w dzienniku)' },
  { key: 'DNS_MANAGE', area: 'Wsparcie', label: 'Edycja rekordów DNS na koncie klienta (z powodem, w dzienniku)' },
  // F2.7 (D2/D8, 10.10) — operacje na domenach klientów u rejestratora; odnowienie na koszt Verris dodatkowo BILLING_MANAGE.
  { key: 'DOMAINS_MANAGE', area: 'Wsparcie', label: 'Domeny klientów u rejestratora: blokada, kod EPP, NS, synchronizacja, odnowienie z portfela klienta, ponowienie rejestracji (z powodem, w dzienniku)' },
  // F3.1 (D4, 10.10) — poczta konta i węzła: kolejka exima (tylko nagłówki), blokada wysyłki konta.
  { key: 'MAIL_QUEUE_VIEW', area: 'Wsparcie', label: 'Kolejka poczty konta klienta: nagłówki oczekujących wiadomości, bez treści (w dzienniku)' },
  { key: 'MAIL_SEND_BLOCK', area: 'Bezpieczeństwo', label: 'Blokada i zwolnienie wysyłki poczty konta, usuwanie jego wiadomości z kolejki (z powodem, w dzienniku)' },
  { key: 'MAIL_QUEUE_NODE', area: 'Infrastruktura', label: 'Kolejka poczty całego węzła: podgląd nagłówków i wypchnięcie kolejki' },
] as const;

export type StaffPermission = (typeof STAFF_PERMISSIONS)[number]['key'];

export const STAFF_PERMISSION_KEYS: StaffPermission[] = STAFF_PERMISSIONS.map((p) => p.key);

export function isValidStaffPermission(key: string): key is StaffPermission {
  return STAFF_PERMISSION_KEYS.includes(key as StaffPermission);
}

/**
 * PB-47 — uprawnienia tylko dla administratora: nie trafiają do żadnej roli systemowej (test spójności
 * w role-systemowe.spec.ts). Administrator może je świadomie nadać roli własnej.
 */
export const ADMIN_ONLY: readonly StaffPermission[] = ['SETTINGS_MANAGE', 'STAFF_MANAGE'];
