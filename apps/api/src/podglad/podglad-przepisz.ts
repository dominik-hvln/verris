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

const TEKSTOWE = /^(text\/(html|css|javascript|plain|xml)|application\/(javascript|x-javascript|json|ld\+json|xml|rss\+xml|manifest\+json|xhtml\+xml))\b/i;
export function czyTekstowy(contentType: string | undefined): boolean {
  return Boolean(contentType && TEKSTOWE.test(contentType));
}

/**
 * Noc 15.10 — pasek na górze strony HTML w podglądzie: adres podglądu jest publiczny (HTTPS na domenie Verris), więc
 * nie może udawać prawdziwej strony (phishing). Wstawiany za pierwszym `<body…>`; bez `<body>` treść bez zmian.
 */
/** Znaki spoza ASCII jako encje HTML — pasek wstawiamy w treść o dowolnym kodowaniu (UTF-8, windows-1250…). */
function encje(t: string): string {
  return t.replace(/[^\x20-\x7e]/g, (c) => `&#${c.codePointAt(0)};`);
}

export function wstawPasekPodgladu(html: string, domena: string): string {
  const d = domena.replace(/[^a-z0-9.-]/gi, '');
  const pasek =
    `<div data-verris-podglad="1" style="all:initial;display:block;box-sizing:border-box;width:100%;background:#0E3B2E;color:#F4F4EE;` +
    `font:14px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;padding:8px 12px;text-align:center">` +
    `${encje(`Podgląd strony ${d} przed zmianą DNS (Verris). Nie podawaj tu haseł ani danych płatności.`)}</div>`;
  if (/<body\b[^>]*>/i.test(html)) return html.replace(/<body\b[^>]*>/i, (m) => m + pasek);
  // Bez <body> (przeglądarka i tak wyrenderuje treść) — pasek na początku, po ewentualnym <!doctype>.
  const doctype = /^\s*<!doctype[^>]*>/i.exec(html);
  return doctype ? doctype[0] + pasek + html.slice(doctype[0].length) : pasek + html;
}

/** Nagłówki odpowiedzi węzła, które przechodzą do przeglądarki (lista dozwolonych — white label: bez Server, LiteSpeed, Link itd.). */
export const NAGLOWKI_DOZWOLONE = new Set(['content-type', 'etag', 'last-modified', 'vary', 'content-language', 'content-disposition']);
