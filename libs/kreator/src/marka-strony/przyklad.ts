import type { MigawkaMarki } from './zastosuj.ts';

/**
 * Przykładowa migawka marki (fikcyjna firma „Łódka i Wiosło”) – fikstura testów renderera, eksportu, API i panelu.
 * Kanały kolorów jak w kreatorze marki: `currentColor` = kolor główny, `var(--akcent, currentColor)` = akcent;
 * metadane „wygenerowano z pomocą AI” w <metadata> (na stronę nie trafiają).
 */
const ZNAK = '<circle cx="50" cy="50" r="40" fill="currentColor"/><path d="M20 60 Q50 30 80 60" fill="none" stroke="var(--akcent, currentColor)" stroke-width="8" stroke-linecap="round"/>';
const METADANE = '<metadata><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description about="logo">AI</rdf:Description></rdf:RDF></metadata>';

export const PRZYKLAD_MIGAWKI_MARKI: MigawkaMarki = {
  markaId: 'marka-lodka-1',
  wersja: 3,
  nazwa: 'Łódka i Wiosło',
  logoPoziome:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 100" role="img" aria-label="Łódka i Wiosło">${METADANE}<title>Łódka i Wiosło</title>` +
    `<defs><clipPath id="k"><rect width="100" height="100"/></clipPath></defs><g clip-path="url(#k)">${ZNAK}</g>` +
    '<text x="118" y="62" font-family="Fraunces" font-size="34" font-weight="600" fill="currentColor">Łódka &amp; Wiosło</text></svg>',
  sygnet: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${ZNAK}</svg>`,
  logoNegatyw:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 100"><circle cx="50" cy="50" r="40" fill="#FFFFFF"/>' +
    '<path d="M20 60 Q50 30 80 60" fill="none" stroke="var(--akcent, #FFFFFF)" stroke-width="8"/><text x="118" y="62" font-family="Fraunces" font-size="34" fill="#FFFFFF">Łódka &amp; Wiosło</text></svg>',
  favicon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="currentColor"/><circle cx="32" cy="32" r="14" fill="var(--akcent, currentColor)"/></svg>',
  faviconPng: 'assets/marka/favicon-192.png',
  obrazOg: 'https://cdn.przyklad.pl/marka/og.png',
  kolory: { glowny: '#1F3A5F', akcent: '#E07A3F' },
  paleta: {
    tlo: '#FBF8F3',
    powierzchnia: '#F1EBE1',
    tekst: '#1B2430',
    tekstPrzygaszony: '#4A5563',
    akcent: '#1F3A5F',
    naAkcencie: '#FFFFFF',
    akcentTekst: '#1F3A5F',
    linia: '#DCD3C4',
    ciemne: '#14263D',
    naCiemnym: '#F5F1EA',
  },
  fonty: { naglowki: 'Playfair Display', tekst: 'Inter' },
};
