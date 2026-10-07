import { EMAIL_MARKETING_W_SPRZEDAZY, SPECYFIKACJA_OPUBLIKOWANA, VPS_W_SPRZEDAZY } from './oferta';
// Jedno źródło nawigacji i stopki (używane przez Header, Footer, sitemap).

export const PANEL = 'https://panel.verris.pl';
export const LEGAL = 'https://panel.verris.pl/legal';

export const KB_URL = 'https://pomoc.verris.pl';

export const headerLinks: { label: string; href: string }[] = [
  { label: 'Hosting', href: '/hosting' },
  { label: 'Cennik', href: '/cennik' },
  { label: 'Przenieś stronę', href: '/przenies-strone' },
  { label: 'Domeny', href: '/domeny' },
  ...(SPECYFIKACJA_OPUBLIKOWANA ? [{ label: 'Specyfikacja', href: '/specyfikacja' }] : []),
  { label: 'Pomoc', href: KB_URL },
];

export const footerCols: { heading: string; links: { label: string; href: string }[] }[] = [
  {
    heading: 'Usługi',
    links: [
      { label: 'Hosting z autoskalowaniem', href: '/hosting' },
      { label: 'Hosting WordPress', href: '/hosting/wordpress' },
      { label: 'Hosting dla sklepu', href: '/hosting/sklep' },
      ...(VPS_W_SPRZEDAZY ? [{ label: 'VPS', href: '/vps' }] : []),
      { label: 'Domeny', href: '/domeny' },
      { label: 'Poczta', href: '/poczta' },
      ...(EMAIL_MARKETING_W_SPRZEDAZY ? [{ label: 'E-mail marketing', href: '/email-marketing' }] : []),
      { label: 'Program resellerski', href: '/reseller' },
    ],
  },
  {
    heading: 'Funkcje',
    links: [
      { label: 'Autoskalowanie', href: '/funkcje/autoskalowanie' },
      { label: 'Migracja', href: '/przenies-strone' },
      { label: 'Certyfikaty SSL', href: '/funkcje/ssl' },
      { label: 'Kopie zapasowe', href: '/funkcje/kopie-zapasowe' },
      { label: 'Domeny bez auto-odnowień', href: '/funkcje/domeny-bez-auto-odnowien' },
      { label: 'SLA 99,5%', href: '/funkcje/sla' },
      ...(SPECYFIKACJA_OPUBLIKOWANA ? [{ label: 'Specyfikacja techniczna', href: '/specyfikacja' }] : []),
    ],
  },
  {
    heading: 'Firma',
    links: [
      { label: 'O nas', href: '/o-nas' },
      { label: 'Blog', href: '/blog' },
      { label: 'Pomoc (baza wiedzy)', href: 'https://pomoc.verris.pl' },
      { label: 'Kontakt', href: '/kontakt' },
      { label: 'Status usług', href: 'https://status.verris.pl' },
    ],
  },
  {
    heading: 'Prawne',
    links: [
      { label: 'Regulamin', href: `${LEGAL}` },
      { label: 'Polityka prywatności', href: `${LEGAL}` },
      { label: 'Pliki cookie', href: `${LEGAL}` },
      { label: 'DPA i podprocesorzy', href: `${LEGAL}` },
    ],
  },
];
