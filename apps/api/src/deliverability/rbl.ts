/**
 * Czy odpowiedź DNSBL oznacza wpis na liście. Wpis to adres 127.0.x.x
 * (Spamhaus 127.0.0.2–11, SpamCop/Barracuda 127.0.0.2). Adresy 127.255.255.x
 * to KODY BŁĘDU — np. .254 „zapytanie przez publiczny resolver”, .255 „za dużo
 * zapytań”. Pomiar 2026-09-23: panel pokazywał klientowi „IP serwera jest na
 * zen.spamhaus.org”, bo Spamhaus odrzucał zapytania z resolvera serwera.
 */
export function rblListed(answers: string[]): boolean {
  return answers.some((a) => a.startsWith('127.') && !a.startsWith('127.255.'));
}
