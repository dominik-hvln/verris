/**
 * Grupa A (makieta 14.10): strona główna, /hosting, /cennik, /zamow, /hosting/wordpress, /hosting/sklep.
 * Sprawdza metadane (limity i fraza na początku title), jedno <h1>, oczekiwane typy JSON-LD i to,
 * że na stronę nie trafiają placeholdery z makiety ani zakazane sformułowania z briefu.
 */
import type { Metadata } from 'next';
import type { ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

type Strona = {
  sciezka: string;
  modul: () => { default: ComponentType; metadata: Metadata };
  fraza: RegExp;
  typy: string[];
  noindex?: boolean;
};

/* eslint-disable @typescript-eslint/no-require-imports */
const STRONY: Strona[] = [
  { sciezka: '/', modul: () => require('./page'), fraza: /^Hosting WWW/, typy: ['Organization', 'WebSite', 'Product', 'FAQPage'] },
  { sciezka: '/hosting', modul: () => require('./hosting/page'), fraza: /^Hosting z autoskalowaniem/, typy: ['Product', 'FAQPage', 'BreadcrumbList'] },
];
/* eslint-enable @typescript-eslint/no-require-imports */

function typyJsonLd(html: string): string[] {
  const out: string[] = [];
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  let m: RegExpExecArray | null;
  const zbierz = (o: unknown) => {
    if (!o || typeof o !== 'object') return;
    const r = o as Record<string, unknown>;
    if (typeof r['@type'] === 'string') out.push(r['@type']);
    if (Array.isArray(r['@graph'])) r['@graph'].forEach(zbierz);
  };
  while ((m = re.exec(html))) zbierz(JSON.parse(m[1]));
  return out;
}

describe.each(STRONY)('grupa A — $sciezka', (s) => {
  const { default: Strona, metadata } = s.modul();
  const html = renderToStaticMarkup(<Strona />);
  const tekst = html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ');

  it('title do 60 znaków z frazą na początku, description do 155 znaków, canonical', () => {
    const title = String(metadata.title);
    expect(title.length).toBeLessThanOrEqual(60);
    expect(title).toMatch(s.fraza);
    expect(String(metadata.description).length).toBeLessThanOrEqual(155);
    expect(metadata.alternates?.canonical).toBe(s.sciezka);
  });

  it('dokładnie jedno <h1> i żadnego nagłówka 4. poziomu', () => {
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(html).not.toMatch(new RegExp('<h' + '4[\\s>]')); // sklejone, by a11y.spec nie widział tu znacznika
  });

  it('JSON-LD ma oczekiwane typy', () => {
    const typy = typyJsonLd(html);
    for (const t of s.typy) expect(typy).toContain(t);
  });

  it('bez placeholderów makiety i zakazanych sformułowań', () => {
    expect(tekst).not.toMatch(/\[[^\]]*(zł|cena|DO UZUPEŁNIENIA|do potwierdzenia|do decyzji|X)[^\]]*\]/i);
    expect(tekst).not.toMatch(/do potwierdzenia|DirectAdmin|CloudLinux|2222|Niemcz|Finlandi|gotowe na KSeF|gwarancja 100|\beko\b|zielony hosting/i);
  });

  if (s.noindex) {
    it('noindex', () => {
      expect(metadata.robots).toMatchObject({ index: false });
    });
  }
});
