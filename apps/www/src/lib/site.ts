import { EMAIL_MARKETING_W_SPRZEDAZY, SPECYFIKACJA_OPUBLIKOWANA, VPS_W_SPRZEDAZY } from './oferta';
// Jedno źródło nawigacji i stopki (używane przez Header, Footer, sitemap).

export const PANEL = 'https://panel.verris.pl';
export const LEGAL = 'https://panel.verris.pl/legal';

export const KB_URL = 'https://pomoc.verris.pl';

// Makieta 14.10 (artefakt „verris.pl — makieta rozbudowy”, plansze Naglowek/Stopka): pasek pomocniczy nad
// nawigacją, w nawigacji usługi + przeprowadzka + funkcje + cennik + blog; stopka w pięciu kolumnach.
export const ZAMOW = '/zamow';

export const headerLinks: { label: string; href: string }[] = [
  { label: 'Hosting', href: '/hosting' },
  { label: 'Domeny', href: '/domeny' },
  { label: 'Poczta', href: '/poczta' },
  ...(VPS_W_SPRZEDAZY ? [{ label: 'VPS', href: '/vps' }] : []),
  { label: 'Przeniesienie strony', href: '/przenies-strone' },
  { label: 'Funkcje', href: '/funkcje' },
  { label: 'Cennik', href: '/cennik' },
  { label: 'Blog', href: '/blog' },
];

export const topLinks: { label: string; href: string }[] = [
  { label: 'Pomoc', href: KB_URL },
  { label: 'Status usług', href: 'https://status.verris.pl' },
  { label: 'Kontakt', href: '/kontakt' },
  { label: 'Dla agencji', href: '/reseller' },
];

export const footerCols: { heading: string; links: { label: string; href: string }[] }[] = [
  {
    heading: 'Hosting',
    links: [
      { label: 'Hosting WWW', href: '/hosting' },
      { label: 'Hosting WordPress', href: '/hosting/wordpress' },
      { label: 'Hosting dla sklepu', href: '/hosting/sklep' },
      { label: 'Cennik', href: '/cennik' },
      ...(SPECYFIKACJA_OPUBLIKOWANA ? [{ label: 'Specyfikacja', href: '/specyfikacja' }] : []),
    ],
  },
  {
    heading: 'Usługi',
    links: [
      { label: 'Domeny', href: '/domeny' },
      { label: 'Poczta w domenie', href: '/poczta' },
      ...(VPS_W_SPRZEDAZY ? [{ label: 'Serwery VPS', href: '/vps' }] : []),
      { label: 'Przeniesienie strony', href: '/przenies-strone' },
      ...(EMAIL_MARKETING_W_SPRZEDAZY ? [{ label: 'E-mail marketing', href: '/email-marketing' }] : []),
    ],
  },
  {
    heading: 'Funkcje',
    links: [
      { label: 'Autoskalowanie', href: '/funkcje/autoskalowanie' },
      { label: 'Kopie zapasowe', href: '/funkcje/kopie-zapasowe' },
      { label: 'SLA 99,5%', href: '/funkcje/sla' },
      { label: 'Wszystkie funkcje', href: '/funkcje' },
    ],
  },
  {
    heading: 'Wiedza',
    links: [
      { label: 'Blog', href: '/blog' },
      { label: 'Pomoc', href: KB_URL },
      { label: 'Jak wybrać hosting', href: '/jak-wybrac-hosting' },
      { label: 'Poradniki przeprowadzki', href: '/przenies-strone#poradniki' },
    ],
  },
  {
    heading: 'Firma',
    links: [
      { label: 'O nas', href: '/o-nas' },
      { label: 'Kontakt', href: '/kontakt' },
      { label: 'Dla agencji', href: '/reseller' },
      { label: 'Program poleceń', href: '/polecaj' },
      { label: 'Dokumenty i RODO', href: '/dokumenty' },
      { label: 'Status usług', href: 'https://status.verris.pl' },
    ],
  },
];

export const legalLinks: { label: string; href: string }[] = [
  { label: 'Regulamin', href: LEGAL },
  { label: 'Polityka prywatności', href: LEGAL },
  { label: 'Cookies', href: LEGAL },
];
