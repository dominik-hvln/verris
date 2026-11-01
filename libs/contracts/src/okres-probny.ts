import type { SubscriptionStatus } from './subscription.dto.ts';

/**
 * 1.11 — ograniczenia okresu próbnego widziane z panelu klienta. Te same reguły egzekwuje API
 * (apps/api/src/subscriptions/okres-probny.ts): w trwającej próbie bez rejestracji i transferu domen
 * (gdy klient nie ma żadnej płatnej usługi), bez dodatkowej mocy, wysyłka do LIMIT_WYSYLKI_PROBY wiadomości na dobę.
 */
const DZIALAJACE: SubscriptionStatus[] = ['ACTIVE', 'PROVISIONING', 'PAST_DUE'];

type UslugaProby = { isTrial: boolean; status: SubscriptionStatus };

/** Usługa w trwającym okresie próbnym (po konwersji API zdejmuje isTrial). */
export function uslugaWProbie(s: UslugaProby): boolean {
  return s.isTrial && DZIALAJACE.includes(s.status);
}

/** Klient ma trwającą próbę i żadnej płatnej, działającej usługi — wtedy API odrzuca zakup domeny. */
export function tylkoProbneUslugi(uslugi: UslugaProby[]): boolean {
  const proby = uslugi.filter(uslugaWProbie).length;
  const platne = uslugi.filter((s) => !s.isTrial && DZIALAJACE.includes(s.status)).length;
  return proby > 0 && platne === 0;
}
