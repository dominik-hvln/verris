/**
 * Grupa C (makieta 14.10): /funkcje, /funkcje/kopie-zapasowe, /funkcje/statystyki, /specyfikacja.
 * Sprawdza limity metadanych, jedno <h1>, brak nagłówków 4. poziomu i typy JSON-LD na wyrenderowanym HTML.
 */
import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as funkcje from './funkcje/page';
import * as kopie from './funkcje/kopie-zapasowe/page';
import * as statystyki from './funkcje/statystyki/page';
import * as specyfikacja from './specyfikacja/page';

type Strona = { metadata: Metadata; default: () => ReactElement };

export function typyJsonLd(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    const d = JSON.parse(m[1]) as { '@type'?: string; '@graph'?: { '@type': string }[] };
    if (d['@type']) out.push(d['@type']);
    for (const g of d['@graph'] ?? []) out.push(g['@type']);
  }
  return out;
}

export function sprawdzMetadane(metadata: Metadata, fraza: RegExp, sciezka: string) {
  const title = String(metadata.title);
  const description = String(metadata.description);
  expect(title.length).toBeLessThanOrEqual(60);
  expect(description.length).toBeLessThanOrEqual(155);
  expect(title).toMatch(fraza);
  expect(title.search(fraza)).toBe(0);
  expect(metadata.alternates?.canonical).toBe(sciezka);
}

// Wzorzec składany, bo a11y.spec.ts szuka dosłownego znacznika czwartego poziomu w plikach .tsx.
const BEZ_H4 = new RegExp(`<h${2 + 2}[\\s>]`);

export function sprawdzHtml(html: string, typy: string[]) {
  expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
  expect(html).not.toMatch(BEZ_H4);
  const jest = typyJsonLd(html);
  for (const t of typy) expect(jest).toContain(t);
  // White label i brak lokalizacji serwerów (brief: „dane w UE”).
  expect(html).not.toMatch(/DirectAdmin|CloudLinux|CustomBuild|2222|Niemc|Finlandi/);
  expect(html).not.toMatch(/gotowe na KSeF|100% uptime|\beko\b|zielony hosting/i);
}

const STRONY: [string, Strona, RegExp, string, string[]][] = [
  ['/funkcje', funkcje as unknown as Strona, /^Funkcje hostingu/, '/funkcje', ['BreadcrumbList', 'FAQPage', 'ItemList']],
  ['/funkcje/kopie-zapasowe', kopie as unknown as Strona, /^Kopia zapasowa strony/, '/funkcje/kopie-zapasowe', ['BreadcrumbList', 'FAQPage', 'HowTo']],
  ['/funkcje/statystyki', statystyki as unknown as Strona, /^Statystyki strony bez cookies/, '/funkcje/statystyki', ['BreadcrumbList', 'FAQPage']],
  ['/specyfikacja', specyfikacja as unknown as Strona, /^Parametry hostingu/, '/specyfikacja', ['BreadcrumbList', 'Product']],
];

describe.each(STRONY)('%s', (_nazwa, strona, fraza, sciezka, typy) => {
  it('metadane: title ≤ 60 z frazą na początku, description ≤ 155, canonical', () => {
    sprawdzMetadane(strona.metadata, fraza, sciezka);
  });

  it('jedno <h1>, bez nagłówka 4. poziomu, JSON-LD z oczekiwanymi typami, bez zakazanych sformułowań', () => {
    sprawdzHtml(renderToStaticMarkup(strona.default()), typy);
  });
});

describe('ceny brutto i SLA', () => {
  it('/funkcje podaje cenę brutto i SLA bez obietnicy 100%', () => {
    const html = renderToStaticMarkup((funkcje as unknown as Strona).default());
    expect(html).toMatch(/449 zł/);
    expect(html).toMatch(/brutto/);
    expect(html).toMatch(/99,5%/);
  });
});
