// Jedno źródło nawigacji i stopki (używane przez Header, Footer, sitemap).

export const PANEL = 'https://panel.verris.pl';
export const LEGAL = 'https://panel.verris.pl/legal';

export const megaServices: { label: string; href: string; desc: string }[] = [
  { label: 'Hosting z autoskalowaniem', href: '/hosting', desc: 'Płacisz za realne użycie' },
  { label: 'Hosting WordPress', href: '/hosting/wordpress', desc: 'Zoptymalizowany pod WP' },
  { label: 'Hosting pod sklep', href: '/hosting/sklep', desc: 'WooCommerce, piki sprzedaży' },
  { label: 'VPS', href: '/vps', desc: 'Niezarządzany, pełny root' },
  { label: 'Domeny', href: '/domeny', desc: 'Rejestracja i transfer' },
  { label: 'E-mail marketing', href: '/email-marketing', desc: 'Wysyłki z panelu' },
  { label: 'Poczta', href: '/poczta', desc: 'Skrzynki w hostingu' },
  { label: 'Program resellerski', href: '/reseller', desc: 'Odsprzedaż pod swoją marką' },
];

export const KB_URL = 'https://pomoc.verris.pl';

export const headerLinks: { label: string; href: string }[] = [
  { label: 'Funkcje', href: '/funkcje' },
  { label: 'Cennik', href: '/cennik' },
  { label: 'Blog', href: '/blog' },
  { label: 'Pomoc', href: KB_URL },
];

export const footerCols: { heading: string; links: { label: string; href: string }[] }[] = [
  {
    heading: 'Usługi',
    links: [
      { label: 'Hosting z autoskalowaniem', href: '/hosting' },
      { label: 'VPS', href: '/vps' },
      { label: 'Domeny', href: '/domeny' },
      { label: 'E-mail marketing', href: '/email-marketing' },
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
      { label: 'Analityka bez cookies', href: '/funkcje/analityka-bez-cookies' },
      { label: 'SLA 99,5%', href: '/funkcje/sla' },
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
