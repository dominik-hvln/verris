import type { AkcjaObiektu } from "./rejestr";

/**
 * Rejestr działań na kliencie (plan E, patch 11) — sekcja „Działania” na karcie klienta i Cmd+K. Dochodzą
 * operacje, które były poza kartą: zdjęcie blokady poczty (/deliverability), reseller i narzut (/resellers,
 * z ręcznym wpisywaniem ID), akceptacja w programie partnerskim (/referral-enrollments) i odpowiedź na
 * zgłoszenie (panel obsługi). `perm` jak w API (admin/users, admin/billing, admin/reseller,
 * admin/deliverability, admin/custom-terms).
 */
export interface KlientDlaAkcji {
  id: string;
  /** undefined — nie wiadomo (Cmd+K albo brak uprawnienia do odczytu); kiedy() wtedy pokazuje działanie. */
  blokadaPoczty?: boolean;
  reseller?: "PENDING" | "ACTIVE" | "SUSPENDED" | null;
  partner?: "PENDING" | "APPROVED" | "REJECTED" | null;
  logowanieZablokowane?: boolean;
  /** Najstarsze otwarte zgłoszenie (ID); null — brak otwartych. */
  otwarteZgloszenie?: string | null;
  /** Adres panelu obsługi (NEXT_PUBLIC_STAFF_PANEL_URL). */
  panelObslugi?: string;
}

const karta = (k: KlientDlaAkcji, sekcja: string | null, kotwica?: string) =>
  `/customers/${k.id}${sekcja ? `?sekcja=${sekcja}` : ""}${kotwica ? `#${kotwica}` : ""}`;

export const AKCJE_KLIENTA: AkcjaObiektu<KlientDlaAkcji>[] = [
  {
    id: "kredyty",
    grupa: "Konto",
    nazwa: "Dodaj kredyty",
    opis: "Zasilenie portfela z powodem w dzienniku.",
    perm: "BILLING_MANAGE",
    kiedy: () => true,
    href: (k) => karta(k, null, "akcje-klienta"),
    slowa: "kredyty portfel zasil doładuj",
  },
  {
    id: "zaloguj",
    grupa: "Konto",
    nazwa: "Zaloguj jako klient",
    opis: "Panel klienta jego oczami; wejście trafia do dziennika.",
    perm: "CUSTOMERS_IMPERSONATE",
    kiedy: () => true,
    href: (k) => karta(k, null, "akcje-klienta"),
    slowa: "impersonacja zaloguj jako",
  },
  {
    id: "blokada-logowania",
    grupa: "Konto",
    nazwa: (k) => (k.logowanieZablokowane ? "Odblokuj logowanie" : "Blokada logowania"),
    opis: "Klient nie zaloguje się do panelu; powód trafia do dziennika.",
    perm: "CUSTOMERS_MANAGE",
    kiedy: () => true,
    href: (k) => karta(k, "dostepy", "blokada"),
    slowa: "zablokuj odblokuj logowanie",
  },
  {
    id: "konto-wewnetrzne",
    grupa: "Konto",
    nazwa: "Konto wewnętrzne",
    opis: "Konto testowe — poza metrykami biznesowymi (MRR, churn).",
    // PATCH admin/users/:id/operational — strażnik CUSTOMERS_MANAGE i serwis CUSTOMERS_INTERNAL_FLAG (oba);
    // wniosek CUSTOMER_INTERNAL_FLAG (rejestr-wnioskow.ts: uprawnienie + uprawnieniaDodatkowe).
    perm: { wszystkie: ["CUSTOMERS_INTERNAL_FLAG", "CUSTOMERS_MANAGE"] },
    kiedy: () => true,
    href: (k) => karta(k, "dostepy", "blokada"),
    slowa: "konto wewnętrzne testowe zespół",
    wniosek: ["CUSTOMERS_VIEW"],
  },
  {
    id: "email",
    grupa: "Konto",
    nazwa: "Zmień e-mail",
    opis: "Nowy adres logowania klienta.",
    perm: "ADMIN",
    kiedy: () => true,
    href: (k) => karta(k, "dostepy", "email"),
    slowa: "email adres",
  },
  {
    id: "reset",
    grupa: "Konto",
    nazwa: "Reset hasła",
    opis: "Link do ustawienia nowego hasła.",
    perm: "ADMIN",
    kiedy: () => true,
    href: (k) => karta(k, "dostepy", "reset"),
    slowa: "hasło reset",
  },
  {
    id: "usuniecie",
    grupa: "Konto",
    nazwa: "Usuń konto (RODO)",
    opis: "Anonimizacja danych klienta — nieodwracalna.",
    perm: "ADMIN",
    kiedy: () => true,
    href: (k) => karta(k, "dostepy", "usuniecie"),
    slowa: "rodo usuń anonimizacja",
  },
  {
    id: "blokada-poczty",
    grupa: "Poczta i usługi",
    nazwa: "Zdejmij blokadę wysyłki poczty",
    opis: "Konto wysyłało podejrzanie dużo poczty i zostało zablokowane.",
    // POST admin/deliverability/cordons/release — @Roles(ADMIN).
    perm: "ADMIN",
    kiedy: (k) => k.blokadaPoczty !== false,
    href: (k) => karta(k, "dostepy", "blokada-poczty"),
    slowa: "blokada poczty spam cordon deliverability wysyłka",
  },
  {
    id: "dns-tls",
    grupa: "Poczta i usługi",
    nazwa: "Diagnostyka DNS i TLS",
    opis: "Rekordy domeny i certyfikat dla usług klienta.",
    perm: "CUSTOMERS_VIEW",
    kiedy: () => true,
    href: (k) => karta(k, "uslugi", "dns-tls"),
    slowa: "dns tls ssl certyfikat diagnostyka",
  },
  {
    id: "reseller",
    grupa: "Rozliczenia",
    nazwa: (k) => (k.reseller === "PENDING" ? "Zatwierdź resellera" : k.reseller ? "Reseller i narzut" : "Włącz resellera"),
    opis: "Sprzedaż usług pod własną marką z narzutem.",
    perm: "CUSTOMERS_MANAGE",
    kiedy: () => true,
    href: (k) => karta(k, "rozliczenia", "reseller"),
    slowa: "reseller narzut marka odsprzedaż",
  },
  {
    id: "dane-nabywcy",
    grupa: "Rozliczenia",
    nazwa: "Dane nabywcy",
    opis: "Kraj i NIP na fakturach; zmiana zeruje weryfikację VAT.",
    // PATCH admin/billing/nabywcy/:userId/vat/dane — BILLING_MANAGE.
    perm: "BILLING_MANAGE",
    kiedy: () => true,
    href: (k) => karta(k, "rozliczenia", "dane-nabywcy"),
    slowa: "nip vat kraj dane nabywcy faktura firma",
    pomocId: "dane-nabywcy",
  },
  {
    id: "partner",
    grupa: "Rozliczenia",
    nazwa: "Program partnerski",
    opis: "Akceptacja zgłoszenia do programu poleceń.",
    perm: "PROMO_MANAGE",
    kiedy: (k) => k.partner === undefined || k.partner === "PENDING",
    href: (k) => karta(k, "rozliczenia", "program-partnerski"),
    slowa: "partner polecenia referral akceptuj",
  },
  {
    id: "warunki",
    grupa: "Rozliczenia",
    nazwa: "Warunki indywidualne",
    opis: "Usługa z własną ceną, rabat, rozliczenie poza Verris.",
    perm: "CUSTOM_TERMS_MANAGE",
    kiedy: () => true,
    href: (k) => karta(k, "warunki"),
    slowa: "warunki cena rabat indywidualne",
  },
  {
    id: "odpowiedz",
    grupa: "Obsługa",
    nazwa: "Odpowiedz na zgłoszenie",
    opis: "Otwiera zgłoszenie w panelu obsługi.",
    perm: "TICKETS_MANAGE",
    kiedy: (k) => k.otwarteZgloszenie !== null,
    href: (k) => (k.otwarteZgloszenie && k.panelObslugi ? new URL(`/tickets/${k.otwarteZgloszenie}`, k.panelObslugi).toString() : karta(k, "zgloszenia")),
    zewnetrzna: (k) => !!(k.otwarteZgloszenie && k.panelObslugi),
    slowa: "zgłoszenie odpowiedz ticket obsługa",
  },
];
