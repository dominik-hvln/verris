import type { WarunekUprawnien } from "./akcje/wezel";

/**
 * D1 (10.10) — panel operatora dla ADMIN i STAFF: każda strona panelu z uprawnieniem, którego wymaga API pod nią
 * (strażnik trasy, którą strona czyta przy wejściu). Jedno źródło dla bramki strony (bramkaStrony — „Brak uprawnień”
 * przy wejściu z adresu) i dla menu/Cmd+K (test uprawnienia-stron.spec.ts pilnuje zgodności z admin-shell.tsx).
 *
 * `perm`: nazwa uprawnienia; lista — wystarcza którekolwiek (@StaffPermAny); „ADMIN” — tylko administrator
 * (trasa @Roles(ADMIN), w tym konfiguracja platformy, plany i ceny, VPN — decyzja D1); null — każdy operator.
 */
export const STRONY = {
  "/": { perm: "DASHBOARD_VIEW", tytul: "Pulpit" },
  "/ai-knowledge": { perm: "DASHBOARD_VIEW", tytul: "Wiedza AI" },
  "/audit": { perm: "AUDIT_VIEW", tytul: "Dziennik bezpieczeństwa" },
  "/autoscaling": { perm: "ADMIN", tytul: "Reguły cenowe autoskalowania" },
  "/autoscaling/revenue": { perm: "ADMIN", tytul: "Przychody z autoskalowania" },
  "/beta": { perm: "PROMO_MANAGE", tytul: "Beta" },
  // Dane z pulpitu (admin/dashboard/overview — DASHBOARD_VIEW, mają je wszystkie role z BILLING_VIEW) i eksport CSV.
  "/billing": { perm: "BILLING_VIEW", tytul: "Portfel i płatności" },
  "/billing/webhooki": { perm: "BILLING_MANAGE", tytul: "Webhooki płatności" },
  "/compliance": { perm: "COMPLIANCE_MANAGE", tytul: "RODO" },
  "/customers": { perm: "CUSTOMERS_VIEW", tytul: "Klienci" },
  "/customers/[userId]": { perm: "CUSTOMERS_VIEW", tytul: "Klient" },
  "/deliverability": { perm: "CUSTOMERS_VIEW", tytul: "Blokady poczty" },
  "/domain-pricing": { perm: "ADMIN", tytul: "Domeny i SSL" },
  // F2.7 — domeny platformy: odczyt od L1 (admin/domains — CUSTOMERS_VIEW); operacje DOMAINS_MANAGE wyszarzone na karcie.
  "/domains": { perm: "CUSTOMERS_VIEW", tytul: "Domeny" },
  "/domains/[id]": { perm: "CUSTOMERS_VIEW", tytul: "Domena" },
  "/invoices": { perm: "BILLING_VIEW", tytul: "Faktury" },
  "/invoices/[invoiceId]": { perm: "BILLING_VIEW", tytul: "Faktura" },
  "/invoices/[invoiceId]/korekta": { perm: "BILLING_MANAGE", tytul: "Korekta faktury" },
  "/invoices/czeka-na-fakture": { perm: "BILLING_VIEW", tytul: "Czeka na fakturę" },
  "/invoices/reczna": { perm: "BILLING_MANAGE", tytul: "Faktura ręczna" },
  // Odczyt bazy wiedzy — każdy pracownik (fala 1A); edycja KB_MANAGE wyszarzona na stronie.
  "/knowledge-base": { perm: null, tytul: "Baza wiedzy" },
  "/marketing": { perm: "PROMO_MANAGE", tytul: "Marketing" },
  "/marketing/[id]": { perm: "PROMO_MANAGE", tytul: "Kampania" },
  "/metrics": { perm: "DASHBOARD_VIEW", tytul: "Metryki" },
  "/migrations": { perm: "MIGRATIONS_MANAGE", tytul: "Migracje" },
  "/migrations/[id]": { perm: "MIGRATIONS_MANAGE", tytul: "Migracja" },
  // D11 — tablica migracji (admin/migrations/tablica — MIGRATIONS_MANAGE: L2 support migracji i wyżej, NOC).
  "/migrations/tablica": { perm: "MIGRATIONS_MANAGE", tytul: "Tablica migracji" },
  "/migrations/za-klienta": { perm: "MIGRATIONS_MANAGE", tytul: "Migracja za klienta" },
  "/nodes": { perm: "NODES_VIEW", tytul: "Węzły" },
  "/nodes/[id]": { perm: "NODES_VIEW", tytul: "Węzeł" },
  "/nodes/capacity": { perm: "NODES_VIEW", tytul: "Pojemność" },
  // Przekierowanie na kreator.
  "/nodes/init": { perm: "ADMIN", tytul: "Dodaj węzeł" },
  "/nodes/kopie": { perm: "ADMIN", tytul: "Próby odtworzenia" },
  "/nodes/przekroczenia": { perm: "NODES_VIEW", tytul: "Przekroczenia limitów" },
  "/nodes/stack": { perm: "NODES_MANAGE", tytul: "Operacje floty" },
  "/nodes/wizard": { perm: "ADMIN", tytul: "Dodaj węzeł" },
  "/nodes/wykresy": { perm: "NODES_VIEW", tytul: "Wykresy i prognozy" },
  "/observability/errors": { perm: "NODES_VIEW", tytul: "Błędy aplikacji" },
  "/operators": { perm: "STAFF_MANAGE", tytul: "Operatorzy" },
  "/operators/[id]": { perm: "STAFF_MANAGE", tytul: "Operator" },
  "/partners": { perm: "BILLING_VIEW", tytul: "Program partnerski" },
  // Podgląd planów — PLANS_MANAGE; zmiany planów i cen tylko administrator (D1).
  "/plans": { perm: "PLANS_MANAGE", tytul: "Plany" },
  "/plans/[id]": { perm: "PLANS_MANAGE", tytul: "Plan" },
  "/plans/new": { perm: "ADMIN", tytul: "Nowy plan" },
  "/plans/new-email": { perm: "ADMIN", tytul: "Nowy plan poczty" },
  "/product-ops": { perm: "ADMIN", tytul: "Komunikaty i flagi" },
  "/promo-codes": { perm: "PROMO_MANAGE", tytul: "Kody promocyjne" },
  "/provisioning-queue": { perm: "PROVISIONING_MANAGE", tytul: "Kolejka zadań" },
  "/referral-enrollments": { perm: "PROMO_MANAGE", tytul: "Wnioski partnerskie" },
  "/resellers": { perm: "CUSTOMERS_MANAGE", tytul: "Resellerzy" },
  "/roles": { perm: "STAFF_MANAGE", tytul: "Role" },
  // Twoje konto (2FA, passkey, break-glass) — każdy operator.
  "/settings": { perm: null, tytul: "Twoje konto" },
  "/settings/ai": { perm: "ADMIN", tytul: "Konfiguracja asystenta" },
  "/settings/canned-responses": { perm: "ADMIN", tytul: "Szablony odpowiedzi" },
  "/settings/company": { perm: "ADMIN", tytul: "Dane firmy" },
  "/settings/kopie-offsite": { perm: "ADMIN", tytul: "Kopie offsite" },
  "/settings/live-readiness": { perm: "ADMIN", tytul: "Gotowość do startu" },
  "/settings/mail": { perm: "ADMIN", tytul: "Poczta (SMTP)" },
  "/settings/mail/log": { perm: "ADMIN", tytul: "Dziennik poczty" },
  "/settings/platform": { perm: "ADMIN", tytul: "Platforma" },
  // Stary adres — przekierowanie na /settings.
  "/settings/security": { perm: null, tytul: "Twoje konto" },
  "/settings/support": { perm: "ADMIN", tytul: "Opieka nad zgłoszeniami" },
  "/settings/team-mail": { perm: "ADMIN", tytul: "Poczta zespołu" },
  "/status/incidents": { perm: "ADMIN", tytul: "Incydenty" },
  "/status/probes": { perm: "ADMIN", tytul: "Sondy" },
  // F2.8 — odczyt jak „Błędy aplikacji”; „Uruchom teraz” tylko ADMIN (API: mozeUruchomic + @Roles(ADMIN)).
  "/system/zadania": { perm: "NODES_VIEW", tytul: "Zadania w tle" },
  "/subscriptions": { perm: "SUBSCRIPTIONS_MANAGE", tytul: "Usługi" },
  // Karta usługi — @StaffPermAny(CUSTOMERS_VIEW, SUBSCRIPTIONS_MANAGE) (L1-KARTA).
  "/subscriptions/[id]": { perm: ["CUSTOMERS_VIEW", "SUBSCRIPTIONS_MANAGE"], tytul: "Usługa" },
  "/tickets": { perm: "TICKETS_VIEW", tytul: "Zgłoszenia" },
  "/vpn": { perm: "ADMIN", tytul: "VPN" },
  "/vps": { perm: "ADMIN", tytul: "VPS" },
  // Każdy składa wnioski i widzi swoje („Moje”); decyzje — REQUESTS_APPROVE (strona pokazuje zakładki wg roli).
  "/wnioski": { perm: null, tytul: "Wnioski o operacje" },
} as const satisfies Record<string, { perm: WarunekUprawnien | null; tytul: string }>;

export type SciezkaStrony = keyof typeof STRONY;
