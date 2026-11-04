import { BadRequestException } from '@nestjs/common';

/**
 * Decyzja 21 Dominika (4.11.2026) — oświadczenie konsumenckie przy KAŻDYM zamówieniu domeny (rejestracja, transfer):
 * żądanie natychmiastowego wykonania usługi i przyjęcie do wiadomości utraty prawa odstąpienia z chwilą jej pełnego
 * wykonania (art. 38 ust. 1 pkt 1 ustawy o prawach konsumenta; Regulamin §12 ust. 8). Wcześniej oświadczenie z pierwszego
 * zakupu obowiązywało „na stałe” dla kolejnych rejestracji — panel zaznaczał je sam. Teraz każde żądanie musi je nieść,
 * a treść i chwila złożenia trafiają do zamówienia (`DomainRegistrarOrder.withdrawalWaiverText/At`).
 */
export const OSWIADCZENIE_REJESTRACJI =
  'Żądam natychmiastowego wykonania usługi rejestracji domeny i przyjmuję do wiadomości, że z chwilą jej zarejestrowania tracę prawo odstąpienia od umowy w tym zakresie.';
export const OSWIADCZENIE_TRANSFERU =
  'Żądam natychmiastowego wykonania usługi transferu domeny i przyjmuję do wiadomości, że z chwilą jej przeniesienia tracę prawo odstąpienia od umowy w tym zakresie.';

export const KOMUNIKAT_BRAK_OSWIADCZENIA =
  'Przy każdym zamówieniu domeny wymagane jest oświadczenie o żądaniu natychmiastowego wykonania usługi i przyjęciu do wiadomości utraty prawa odstąpienia.';

/** Zapis oświadczenia do zamówienia — odrzuca zamówienie, jeśli w tym żądaniu go nie złożono. */
export function oswiadczenieZamowienia(
  rodzaj: 'REGISTER' | 'TRANSFER',
  zgoda: unknown,
  teraz = new Date(),
): { withdrawalWaiverText: string; withdrawalWaiverAt: Date } {
  if (zgoda !== true) throw new BadRequestException(KOMUNIKAT_BRAK_OSWIADCZENIA);
  return {
    withdrawalWaiverText: rodzaj === 'REGISTER' ? OSWIADCZENIE_REJESTRACJI : OSWIADCZENIE_TRANSFERU,
    withdrawalWaiverAt: teraz,
  };
}
