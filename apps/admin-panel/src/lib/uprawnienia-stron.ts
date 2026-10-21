import type { WarunekUprawnien } from "./akcje/wezel";

/**
 * D1 (10.10) — panel operatora dla ADMIN i STAFF: każda strona panelu z uprawnieniem, którego wymaga API pod nią
 * (strażnik trasy, którą strona czyta przy wejściu). Jedno źródło dla bramki strony (bramkaStrony — „Brak uprawnień”
 * przy wejściu z adresu) i dla menu/Cmd+K (test uprawnienia-stron.spec.ts pilnuje zgodności z admin-shell.tsx).
 *
 * `perm`: nazwa uprawnienia; lista — wystarcza którekolwiek (@StaffPermAny); „ADMIN” — tylko administrator
 * (trasa @Roles(ADMIN), w tym konfiguracja platformy, plany i ceny, VPN — decyzja D1); null — każdy operator.
 *
 * `api` (weryfikacja 11.10): trasy GET, które strona czyta przy wejściu (bez sekcji, które same pokazują „Wymaga …”).
 * Test macierzy w API (apps/api/src/test/macierz-menu-stron.spec.ts) sprawdza prawdziwymi strażnikami, że każda rola
 * systemowa, której `perm` otwiera stronę, przejdzie przez strażników tych tras — czyli pozycja menu ⊆ strona, która
 * się otworzy. Strony tylko dla administratora (`perm: "ADMIN"`) ich nie potrzebują. Każdy wpis w jednej linii (test
 * czyta ten plik jako tekst — paczka API nie importuje kodu paneli).
 */
export const STRONY = {
  "/": { perm: "DASHBOARD_VIEW", tytul: "Pulpit", api: ["admin/dashboard/overview"] },
  "/ai-knowledge": { perm: "DASHBOARD_VIEW", tytul: "Wiedza AI", api: ["admin/ai/knowledge"] },
  "/audit": { perm: "AUDIT_VIEW", tytul: "Dziennik bezpieczeństwa", api: ["admin/audit-logs"] },
  "/autoscaling": { perm: "ADMIN", tytul: "Reguły cenowe autoskalowania" },
  "/autoscaling/revenue": { perm: "ADMIN", tytul: "Przychody z autoskalowania" },
  "/beta": { perm: "PROMO_MANAGE", tytul: "Beta", api: ["admin/beta/invites"] },
  // Dane z pulpitu (admin/dashboard/overview — DASHBOARD_VIEW; sumy portfela tylko z METRICS_VIEW) i eksport CSV.
  "/billing": { perm: "BILLING_VIEW", tytul: "Portfel i płatności", api: ["admin/dashboard/overview"] },
  "/billing/webhooki": { perm: "BILLING_MANAGE", tytul: "Webhooki płatności", api: ["admin/billing/webhooki"] },
  // F3.6 — admin/rozliczenia/nieudane-platnosci i /windykacja — BILLING_VIEW (L1–L4, Finanse, Audytor); „Ponów” BILLING_MANAGE.
  "/billing/nieudane": { perm: "BILLING_VIEW", tytul: "Nieudane płatności", api: ["admin/rozliczenia/nieudane-platnosci"] },
  "/billing/windykacja": { perm: "BILLING_VIEW", tytul: "Przypomnienia i zawieszenia", api: ["admin/rozliczenia/windykacja"] },
  "/compliance": { perm: "COMPLIANCE_MANAGE", tytul: "RODO", api: ["admin/compliance/documents", "admin/compliance/consents", "admin/compliance/data-exports", "admin/compliance/deletion-requests"] },
  "/customers": { perm: "CUSTOMERS_VIEW", tytul: "Klienci", api: ["admin/users"] },
  "/customers/[userId]": { perm: "CUSTOMERS_VIEW", tytul: "Klient", api: ["admin/users/:userId/customer-profile", "admin/users/:userId/operational-detail"] },
  "/deliverability": { perm: "CUSTOMERS_VIEW", tytul: "Blokady poczty", api: ["admin/deliverability/cordons"] },
  "/domain-pricing": { perm: "ADMIN", tytul: "Domeny i SSL" },
  // F2.7 — domeny platformy: odczyt od L1 (admin/domains — CUSTOMERS_VIEW); operacje DOMAINS_MANAGE wyszarzone na karcie.
  "/domains": { perm: "CUSTOMERS_VIEW", tytul: "Domeny", api: ["admin/domains"] },
  "/domains/[id]": { perm: "CUSTOMERS_VIEW", tytul: "Domena", api: ["admin/domains/:id"] },
  "/invoices": { perm: "BILLING_VIEW", tytul: "Faktury", api: ["admin/invoices"] },
  "/invoices/[invoiceId]": { perm: "BILLING_VIEW", tytul: "Faktura", api: ["admin/invoices/:id"] },
  "/invoices/[invoiceId]/korekta": { perm: "BILLING_MANAGE", tytul: "Korekta faktury", api: ["admin/invoices/:id", "admin/invoices/:id/korekty"] },
  "/invoices/czeka-na-fakture": { perm: "BILLING_VIEW", tytul: "Czeka na fakturę", api: ["admin/invoices/czeka-na-fakture"] },
  "/invoices/reczna": { perm: "BILLING_MANAGE", tytul: "Faktura ręczna", api: [] },
  // Odczyt bazy wiedzy — każdy pracownik (fala 1A); edycja KB_MANAGE wyszarzona na stronie.
  "/knowledge-base": { perm: null, tytul: "Baza wiedzy", api: ["admin/kb/categories", "admin/kb/articles", "admin/kb/cta"] },
  "/marketing": { perm: "PROMO_MANAGE", tytul: "Marketing", api: ["admin/marketing/campaigns"] },
  "/marketing/[id]": { perm: "PROMO_MANAGE", tytul: "Kampania", api: ["admin/marketing/campaigns/:id"] },
  // Weryfikacja 11.10 — admin/metrics/business — METRICS_VIEW (L4, Finanse, ADMIN); L1 ma pulpit, nie metryki biznesowe.
  "/metrics": { perm: "METRICS_VIEW", tytul: "Metryki", api: ["admin/metrics/business"] },
  "/migrations": { perm: "MIGRATIONS_MANAGE", tytul: "Migracje", api: ["admin/migrations"] },
  "/migrations/[id]": { perm: "MIGRATIONS_MANAGE", tytul: "Migracja", api: ["staff/migrations/:id/detail"] },
  // D11 — tablica migracji (admin/migrations/tablica — MIGRATIONS_MANAGE: L2 support migracji i wyżej, NOC).
  "/migrations/tablica": { perm: "MIGRATIONS_MANAGE", tytul: "Tablica migracji", api: ["admin/migrations/tablica"] },
  "/migrations/za-klienta": { perm: "MIGRATIONS_MANAGE", tytul: "Migracja za klienta", api: ["staff/migrations/za-klienta/usluga/:id"] },
  "/nodes": { perm: "NODES_VIEW", tytul: "Węzły", api: ["admin/servers"] },
  "/nodes/[id]": { perm: "NODES_VIEW", tytul: "Węzeł", api: ["admin/servers/:id", "admin/servers/:id/przeglad"] },
  "/nodes/capacity": { perm: "NODES_VIEW", tytul: "Pojemność", api: ["admin/servers/wykresy"] },
  // 21.10 — weryfikator aktualizacji: podgląd NODES_VIEW, instalacja poprawek (POST) NODES_MANAGE — przycisk wyszarzony.
  "/nodes/aktualizacje": { perm: "NODES_VIEW", tytul: "Aktualizacje bezpieczeństwa", api: ["admin/servers/aktualizacje"] },
  // Przekierowanie na kreator.
  "/nodes/init": { perm: "ADMIN", tytul: "Dodaj węzeł" },
  // F3.3 — admin/servers/kopie — NODES_VIEW (admin, NOC); historia prób odtworzenia na stronie tylko dla ADMIN.
  "/nodes/kopie": { perm: "NODES_VIEW", tytul: "Kopie floty", api: ["admin/servers/kopie"] },
  "/nodes/przekroczenia": { perm: "NODES_VIEW", tytul: "Przekroczenia limitów", api: ["admin/servers/przekroczenia"] },
  // F3.2 (G-11/G-12) — admin/servers/malware — ACCOUNT_DIAGNOSTICS_VIEW (L2+, NOC, abuse): ścieżki plików klientów.
  "/nodes/malware": { perm: "ACCOUNT_DIAGNOSTICS_VIEW", tytul: "Złośliwe pliki", api: ["admin/servers/malware"] },
  // Manifest stosu (admin/stack-manifest) czyta tylko administrator — reszta widzi „Aktualizuj flotę”.
  "/nodes/stack": { perm: "NODES_MANAGE", tytul: "Operacje floty", api: [] },
  "/nodes/wizard": { perm: "ADMIN", tytul: "Dodaj węzeł" },
  "/nodes/wykresy": { perm: "NODES_VIEW", tytul: "Wykresy i prognozy", api: ["admin/servers/wykresy"] },
  "/observability/errors": { perm: "NODES_VIEW", tytul: "Błędy aplikacji", api: ["admin/observability/errors"] },
  "/operators": { perm: "STAFF_MANAGE", tytul: "Operatorzy", api: ["admin/users", "admin/staff-roles", "admin/staff-roles/activity"] },
  "/operators/[id]": { perm: "STAFF_MANAGE", tytul: "Operator", api: ["admin/staff-roles/operators", "admin/staff-roles"] },
  "/partners": { perm: "BILLING_VIEW", tytul: "Program partnerski", api: ["admin/partners/config", "admin/partners/payouts"] },
  // Podgląd planów — PLANS_MANAGE; zmiany planów i cen tylko administrator (D1).
  "/plans": { perm: "PLANS_MANAGE", tytul: "Plany", api: ["admin/plans"] },
  "/plans/[id]": { perm: "PLANS_MANAGE", tytul: "Plan", api: ["admin/plans/:id"] },
  "/plans/new": { perm: "ADMIN", tytul: "Nowy plan" },
  "/plans/new-email": { perm: "ADMIN", tytul: "Nowy plan poczty" },
  "/product-ops": { perm: "ADMIN", tytul: "Komunikaty i flagi" },
  "/promo-codes": { perm: "PROMO_MANAGE", tytul: "Kody promocyjne", api: ["admin/billing/promo-codes"] },
  "/provisioning-queue": { perm: "PROVISIONING_MANAGE", tytul: "Kolejka zadań", api: ["admin/provisioning-queue", "admin/servers/node-tasks"] },
  "/referral-enrollments": { perm: "PROMO_MANAGE", tytul: "Wnioski partnerskie", api: ["admin/users/referral-enrollments"] },
  "/resellers": { perm: "CUSTOMERS_MANAGE", tytul: "Resellerzy", api: ["admin/reseller"] },
  "/roles": { perm: "STAFF_MANAGE", tytul: "Role", api: ["admin/staff-roles/catalog", "admin/staff-roles"] },
  // Twoje konto (2FA, passkey, break-glass) — każdy operator.
  "/settings": { perm: null, tytul: "Twoje konto", api: [] },
  "/settings/ai": { perm: "ADMIN", tytul: "Konfiguracja asystenta" },
  "/settings/canned-responses": { perm: "ADMIN", tytul: "Szablony odpowiedzi" },
  "/settings/company": { perm: "ADMIN", tytul: "Dane firmy" },
  "/settings/kopie-offsite": { perm: "ADMIN", tytul: "Kopie offsite" },
  "/settings/live-readiness": { perm: "ADMIN", tytul: "Gotowość do startu" },
  "/settings/mail": { perm: "ADMIN", tytul: "Poczta (SMTP)" },
  "/settings/mail/log": { perm: "ADMIN", tytul: "Dziennik poczty" },
  "/settings/platform": { perm: "ADMIN", tytul: "Platforma" },
  // Stary adres — przekierowanie na /settings.
  "/settings/security": { perm: null, tytul: "Twoje konto", api: [] },
  "/settings/support": { perm: "ADMIN", tytul: "Opieka nad zgłoszeniami" },
  "/settings/team-mail": { perm: "ADMIN", tytul: "Poczta zespołu" },
  "/status/incidents": { perm: "ADMIN", tytul: "Incydenty" },
  "/status/probes": { perm: "ADMIN", tytul: "Sondy" },
  // F2.8 — odczyt jak „Błędy aplikacji”; „Uruchom teraz” tylko ADMIN (API: mozeUruchomic + @Roles(ADMIN)).
  "/system/zadania": { perm: "NODES_VIEW", tytul: "Zadania w tle", api: ["admin/zadania-w-tle"] },
  // Weryfikacja 11.10 — lista usług w trybie odczytu jak karta (GET admin/subscriptions — @StaffPermAny jak karta);
  // eksport CSV dalej SUBSCRIPTIONS_MANAGE + EXPORT_DATA (przycisk na stronie).
  "/subscriptions": { perm: ["CUSTOMERS_VIEW", "SUBSCRIPTIONS_MANAGE"], tytul: "Usługi", api: ["admin/subscriptions"] },
  // Karta usługi — @StaffPermAny(CUSTOMERS_VIEW, SUBSCRIPTIONS_MANAGE) (L1-KARTA).
  "/subscriptions/[id]": { perm: ["CUSTOMERS_VIEW", "SUBSCRIPTIONS_MANAGE"], tytul: "Usługa", api: ["admin/subscriptions/:id"] },
  // F3.8 — admin/komunikaty-serwisowe — SERVICE_NOTICES_SEND (kierownik zmiany L4) i ADMIN.
  "/komunikaty": { perm: "SERVICE_NOTICES_SEND", tytul: "Komunikaty serwisowe", api: ["admin/komunikaty-serwisowe"] },
  "/tickets": { perm: "TICKETS_VIEW", tytul: "Zgłoszenia", api: ["tickets/admin/all"] },
  // F3.7 — admin/poczta-zgloszen — TICKETS_VIEW (odczyt, „Pokaż” plik); decyzje TICKETS_MANAGE wyszarzone na stronie.
  "/tickets/poczta": { perm: "TICKETS_VIEW", tytul: "Poczta bez klienta", api: ["admin/poczta-zgloszen", "admin/poczta-zgloszen/blokady"] },
  // F3.7 — admin/support/raporty — TICKETS_REPORTS (kierownik zmiany L4) i ADMIN.
  "/tickets/raporty": { perm: "TICKETS_REPORTS", tytul: "Raporty obsługi", api: ["admin/support/raporty"] },
  "/vpn": { perm: "ADMIN", tytul: "VPN" },
  "/vps": { perm: "ADMIN", tytul: "VPS" },
  // Każdy składa wnioski i widzi swoje („Moje”); decyzje — REQUESTS_APPROVE (strona pokazuje zakładki wg roli).
  "/wnioski": { perm: null, tytul: "Wnioski o operacje", api: ["admin/wnioski/moje"] },
} as const satisfies Record<string, { perm: WarunekUprawnien | null; tytul: string; api?: readonly string[] }>;

export type SciezkaStrony = keyof typeof STRONY;
