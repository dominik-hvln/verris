/**
 * F2.3 (decyzja D2, 10.10) — powody zawieszenia dostępne dla pracownika obsługi (karta usługi, wniosek, abuse).
 * Zawieszenie „za brak płatności” (PAYMENT_FAILED, GRACE_EXPIRED) uruchamia mail o zaległości i wygaśnięcie umowy
 * po 14 dniach (§7 ust. 3), więc zostaje dla administratora. Osobny plik bez zależności — czyta go też rejestr wniosków.
 */
export const POWODY_ZAWIESZENIA_OPERATORA = ['ABUSE', 'MANUAL_ADMIN', 'CUSTOMER_REQUEST'] as const;
export type PowodZawieszeniaOperatora = (typeof POWODY_ZAWIESZENIA_OPERATORA)[number];
