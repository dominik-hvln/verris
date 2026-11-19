import { BadRequestException } from '@nestjs/common';

/** Adresy węzła z rekordu `Server` — z nich budujemy listę dozwolonych hostów w odpowiedzi phpMyAdmina. */
export type AdresyWezla = {
  hostname: string | null;
  ipAddress: string | null;
  ipv6Address?: string | null;
  daHost?: string | null;
};

const SCIEZKA_SSO = /^\/phpMyAdmin\/sso\/[A-Za-z0-9_-]{1,128}\.php$/;

const normalizuj = (h: string | null | undefined) =>
  (h ?? '').trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');

/**
 * Paczka 129 (feedback bety, pkt 3) — „Ta witryna jest nieosiągalna” po kliknięciu phpMyAdmin.
 *
 * Panel woła DA na porcie 2222 (`client.createPhpMyAdminSso`), a port 2222 jest otwarty tylko dla control-plane
 * (decyzja 2026-09-29, node-hosting-profile.sh → da_panel_csf). SDK sprawdzało w zwróconym adresie tylko https
 * i ścieżkę — host i port szły do klienta bez zmian. Przypuszczenie (do sprawdzenia z dokumentacją DA,
 * docs.directadmin.com, i komendami z raportu paczki 129): DA buduje adres z nagłówka Host żądania API, więc
 * dostaje `https://<host-API>:2222/phpMyAdmin/sso/<jednorazowy>.php` (albo adres wewnętrzny/IP, którym control-plane
 * łączy się z DA). Sam skrypt SSO to plik w katalogu phpMyAdmina serwera WWW (/var/www/html/phpMyAdmin, ten sam,
 * który konfiguruje configure_pma_white_label) — serwer WWW podaje go na 443.
 *
 * Zasady:
 *  - tylko https i tylko ścieżka jednorazowego skryptu /phpMyAdmin/sso/<nazwa>.php, bez loginu/hasła w adresie;
 *  - host musi być JEDNYM z adresów tego węzła (hostname, daHost, IPv4, IPv6) — inny host = błąd, nie link;
 *  - klient dostaje publiczną nazwę hosta węzła (certyfikat jest na nią — faza TLS bootstrapu) na porcie 443:
 *    port panelu (2222) i adres IP/wewnętrzny nigdy nie trafiają do przeglądarki.
 */
export function adresPmaDlaKlienta(url: string, wezel: AdresyWezla): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new BadRequestException('phpMyAdmin jest chwilowo niedostępny – spróbuj ponownie za chwilę.');
  }
  if (u.protocol !== 'https:' || !SCIEZKA_SSO.test(u.pathname) || u.username || u.password) {
    throw new BadRequestException('phpMyAdmin jest chwilowo niedostępny – spróbuj ponownie za chwilę.');
  }
  const publiczny = normalizuj(wezel.hostname);
  const dozwolone = new Set(
    [wezel.hostname, wezel.daHost, wezel.ipAddress, wezel.ipv6Address].map(normalizuj).filter(Boolean),
  );
  if (!dozwolone.has(normalizuj(u.hostname))) {
    throw new BadRequestException(
      'phpMyAdmin zwrócił adres spoza Twojego serwera, więc go nie otworzyliśmy. Napisz do pomocy – sprawdzimy to.',
    );
  }
  if (!publiczny) {
    throw new BadRequestException(
      'phpMyAdmin nie jest jeszcze dostępny na Twoim serwerze. Zarządzaj bazami w panelu albo napisz do pomocy.',
    );
  }
  const wynik = new URL(u.pathname + u.search, `https://${publiczny}`);
  return wynik.toString();
}
