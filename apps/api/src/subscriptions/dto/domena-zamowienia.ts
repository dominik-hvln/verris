import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsString, Length, Matches } from 'class-validator';
import { domainToASCII } from 'node:url';

/**
 * P5-04 (beta 3.11) — domena główna w zamówieniu (panel, okres próbny, publiczne API).
 *
 * Stary wzorzec `/^[a-z0-9.-]+\.[a-z]{2,}$/i` przepuszczał `example..com` i `-zla-.pl` (konto na węźle się nie
 * zakładało już PO opłacie), a odrzucał poprawne polskie IDN (`żółw.pl`). Teraz:
 *  - IDN zamieniamy na zapis ASCII (punycode) jak przeglądarka — WHATWG URL `domainToASCII`
 *    (https://nodejs.org/api/url.html#urldomaintoasciidomain); ta sama forma trafia potem do serwera WWW i DNS,
 *  - każda etykieta 1–63 znaki, bez myślnika na brzegu, bez pustych etykiet (RFC 1035 §2.3.4, RFC 5890),
 *  - całość do 253 znaków, końcówka: same litery albo IDN (`xn--…`).
 */
export const DOMENA_ZAMOWIENIA_RE =
  /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/;

export const KOMUNIKAT_DOMENY =
  'Niepoprawny adres domeny. Wpisz go bez http:// i ukośników, np. mojafirma.pl (polskie znaki są dozwolone).';

/** Postać, w której zapisujemy domenę: małe litery, bez spacji i kropki na końcu, IDN w zapisie ASCII. */
export function normalizujDomeneZamowienia(wejscie: unknown): unknown {
  if (typeof wejscie !== 'string') return wejscie;
  const surowa = wejscie.trim().toLowerCase().replace(/\.+$/, '');
  if (!surowa || /[\s/:@]/.test(surowa)) return surowa;
  // Kropki z rzędu `domainToASCII` by „naprawiło” albo zwróciło pusty napis — zostawiamy wejście, odrzuci je wzorzec.
  if (surowa.includes('..')) return surowa;
  const ascii = domainToASCII(surowa);
  return ascii || surowa;
}

/** Pole `domain` w DTO zamówienia. `@IsOptional()` dokłada DTO, w którym domena nie jest wymagana. */
export function DomenaZamowienia() {
  return applyDecorators(
    Transform(({ value }) => normalizujDomeneZamowienia(value)),
    IsString(),
    Length(4, 253),
    Matches(DOMENA_ZAMOWIENIA_RE, { message: KOMUNIKAT_DOMENY }),
  );
}
