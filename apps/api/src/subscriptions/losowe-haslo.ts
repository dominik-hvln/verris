import { randomInt } from 'node:crypto';

const MALE = 'abcdefghijkmnopqrstuvwxyz';
const DUZE = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const CYFRY = '23456789';
const ZNAKI = MALE + DUZE + CYFRY;

/**
 * F2.2 (D3) — hasło ustawiane przez operatora przy resecie (skrzynka, FTP, użytkownik bazy). Nikt go nie poznaje:
 * nie wraca w odpowiedzi ani w mailu, klient ustawia własne w panelu. 24 znaki alfanumeryczne (bez znaków, które
 * serwer poczty/FTP mógłby odrzucić) i zawsze mała, wielka litera i cyfra — wymóg „trudnego hasła” węzła.
 */
export function losoweHaslo(dlugosc = 24): string {
  for (;;) {
    let h = '';
    for (let i = 0; i < dlugosc; i++) h += ZNAKI[randomInt(ZNAKI.length)];
    if (/[a-z]/.test(h) && /[A-Z]/.test(h) && /[0-9]/.test(h)) return h;
  }
}
