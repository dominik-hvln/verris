/**
 * F2.3 (decyzja D2, 10.10) — powody zawieszenia dostępne dla pracownika obsługi (karta usługi, wniosek, abuse).
 * Zawieszenie „za brak płatności” (PAYMENT_FAILED, GRACE_EXPIRED) uruchamia mail o zaległości i wygaśnięcie umowy
 * po 14 dniach (§7 ust. 3), więc zostaje dla administratora. Osobny plik bez zależności — czyta go też rejestr wniosków.
 */
export const POWODY_ZAWIESZENIA_OPERATORA = ['ABUSE', 'MANUAL_ADMIN', 'CUSTOMER_REQUEST'] as const;
export type PowodZawieszeniaOperatora = (typeof POWODY_ZAWIESZENIA_OPERATORA)[number];

/** Zawieszenie „za brak płatności” — zdejmuje je wpłata klienta (harmonogram, Stripe) albo osoba od rozliczeń. */
export const POWODY_ZA_PLATNOSC = ['PAYMENT_FAILED', 'GRACE_EXPIRED'] as const;

/**
 * Audyt Fal 2 — czy zawieszenie (szczegóły zdarzenia SUSPENDED) obejmuje zaległość klienta: powód płatniczy, usługa
 * była PAST_DUE w chwili zawieszenia (`statusPrzed`) albo nadużycie dopisano na zawieszenie za brak płatności
 * (`zaleglosc`). Odwieszenie takiej usługi przywraca ACTIVE bez zapłaty — to decyzja rozliczeniowa (BILLING_MANAGE).
 */
export function zawieszenieObejmujeZaleglosc(details: unknown): boolean {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return false;
  const d = details as Record<string, unknown>;
  return (POWODY_ZA_PLATNOSC as readonly unknown[]).includes(d.reason) || d.zaleglosc === true || d.statusPrzed === 'PAST_DUE';
}

/**
 * Audyt Fal 2 — zawieszenie, które zdejmuje się samo (wpłata) albo osoba spoza obsługi (reseller). Decyzja obsługi
 * (nadużycie, decyzja, prośba klienta) na takiej usłudze dopisuje się jako nowy powód, żeby wpłata ani reseller jej
 * nie cofnęły.
 */
export const POWODY_ZDEJMOWANE_BEZ_OBSLUGI = [...POWODY_ZA_PLATNOSC, 'RESELLER'] as const;
