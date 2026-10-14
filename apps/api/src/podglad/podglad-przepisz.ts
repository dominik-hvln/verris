/**
 * Przepisanie adresów strony klienta na adres podglądu w treści (HTML, CSS, JS, JSON) i w nagłówkach.
 * WordPress i sklepy wstawiają adresy bezwzględne (`https://domena.pl/…`, w JSON `https:\/\/domena.pl\/…`) —
 * bez podmiany przeglądarka ładowałaby zasoby i linki ze starego hostingu (DNS jeszcze tam wskazuje).
 * Podmieniamy tylko pełną nazwę hosta (domena i www.domena), nie fragmenty innych nazw (np. cdn.domena.pl zostaje).
 */
function wzorzec(host: string): string {
  return host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function przepiszAdresy(tresc: string, domena: string, podglad: string): string {
  const hosty = [`www.${domena}`, domena].map(wzorzec).join('|');
  // Zwykłe: https://host, http://host, //host — po nazwie hosta nie może być znaku nazwy (koniec, /, :, ", ' itd.).
  const zwykle = new RegExp(`(?:https?:)?//(?:${hosty})(?![a-z0-9.-])`, 'gi');
  // W JSON i skryptach: https:\/\/host
  const ucieczka = new RegExp(`(?:https?:)?\\\\/\\\\/(?:${hosty})(?![a-z0-9.-])`, 'gi');
  return tresc.replace(ucieczka, `https:\\/\\/${podglad}`).replace(zwykle, `https://${podglad}`);
}

/** Set-Cookie: bez atrybutu Domain (ciasteczko wraca do hosta podglądu, nie do domeny klienta). */
export function przepiszCookie(naglowek: string): string {
  return naglowek.replace(/;\s*domain=[^;]*/gi, '');
}

const TEKSTOWE = /^(text\/(html|css|javascript|plain|xml)|application\/(javascript|x-javascript|json|ld\+json|xml|rss\+xml|manifest\+json))\b/i;
export function czyTekstowy(contentType: string | undefined): boolean {
  return Boolean(contentType && TEKSTOWE.test(contentType));
}
