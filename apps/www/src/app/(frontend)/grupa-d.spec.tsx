/**
 * Grupa D makiety 14.10: /o-nas, /kontakt, /reseller, /polecaj, /dokumenty i 404. Dla każdej strony:
 * limity title/description z frazą, dokładnie jedno <h1>, oczekiwane typy JSON-LD, brak zakazanych sformułowań.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Next w testach: Link bez routera działa, ale notFound()/headers nie są potrzebne poza server action formularza.
jest.mock('@/lib/submit-lead', () => ({ submitLead: jest.fn() }));

import * as ONas from './o-nas/page';
import * as Kontakt from './kontakt/page';
import * as Reseller from './reseller/page';
import * as Polecaj from './polecaj/page';
import * as Dokumenty from './dokumenty/page';
import * as NotFound from './not-found';
import { POLECENIA } from '@/lib/polecenia';
import { trescKontaktu } from '@/lib/kontakt';

type Strona = { metadata: Metadata; default: () => ReactElement };

const STRONY: { sciezka: string; mod: Strona; fraza: RegExp; typy: string[] }[] = [
  { sciezka: '/o-nas', mod: ONas, fraza: /^O Verris/, typy: ['AboutPage', 'BreadcrumbList'] },
  { sciezka: '/kontakt', mod: Kontakt, fraza: /^Kontakt/, typy: ['ContactPage', 'BreadcrumbList'] },
  { sciezka: '/reseller', mod: Reseller, fraza: /^Hosting dla agencji/, typy: ['Service', 'FAQPage', 'BreadcrumbList'] },
  { sciezka: '/polecaj', mod: Polecaj, fraza: /^Program poleceń/, typy: ['WebPage', 'FAQPage', 'BreadcrumbList'] },
  { sciezka: '/dokumenty', mod: Dokumenty, fraza: /^Regulamin, RODO/, typy: ['CollectionPage', 'BreadcrumbList'] },
];

function jsonLdTypy(html: string): string[] {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(
    (m) => JSON.parse(m[1])['@type'] as string,
  );
}

// Złożone z kawałków: a11y.spec.ts szuka dosłownego znacznika nagłówka czwartego stopnia w plikach .tsx.
const H4 = new RegExp('<h' + '4[\\s>]');

const tekst = (html: string) => html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ');

describe.each(STRONY)('$sciezka', ({ sciezka, mod, fraza, typy }) => {
  const html = renderToStaticMarkup(mod.default());

  it('title ≤ 60 znaków z frazą na początku, description ≤ 155, canonical', () => {
    const title = String(mod.metadata.title);
    const desc = String(mod.metadata.description);
    expect(title.length).toBeLessThanOrEqual(60);
    expect(title).toMatch(fraza);
    expect(desc.length).toBeGreaterThan(50);
    expect(desc.length).toBeLessThanOrEqual(155);
    expect(mod.metadata.alternates?.canonical).toBe(sciezka);
  });

  it('dokładnie jedno <h1>, bez nagłówka 4. stopnia', () => {
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(html).not.toMatch(H4);
  });

  it('JSON-LD ma oczekiwane typy', () => {
    expect(jsonLdTypy(html)).toEqual(expect.arrayContaining(typy));
  });

  it('bez zakazanych sformułowań (white label, lokalizacja serwerów, KSeF, eko, gwarancja 100%)', () => {
    const t = tekst(html);
    expect(t).not.toMatch(/DirectAdmin|CloudLinux|CustomBuild|2222|Niemc|Finlandi|KSeF|\beko|zielony hosting|gwarancj\w* 100/i);
  });
});

describe('/polecaj — warunki zgodne z API', () => {
  const html = tekst(renderToStaticMarkup(Polecaj.default()));

  it('liczby programu = domyślne ustawienia platformy (apps/api platform-settings.keys.ts)', () => {
    const keys = readFileSync(
      join(__dirname, '../../../../api/src/platform-settings/platform-settings.keys.ts'),
      'utf8',
    );
    const def = (k: string) => Number(keys.match(new RegExp(`PARTNER_${k}\\]:\\s*'(\\d+)'`))?.[1]);
    expect(POLECENIA.prowizjaPct).toBe(def('COMMISSION_PCT'));
    expect(POLECENIA.karencjaDni).toBe(def('HOLD_DAYS'));
    expect(POLECENIA.minWyplataZl).toBe(def('MIN_PAYOUT'));
    expect(POLECENIA.bonusCoPolecen).toBe(def('FREE_HOSTING_THRESHOLD'));
    expect(POLECENIA.bonusKredyty).toBe(def('FREE_HOSTING_CREDIT'));
  });

  it('prowizja 10% i przykład policzony z ceny 449 zł/rok', () => {
    expect(html).toMatch(/10% od każdej/);
    expect(html).toMatch(/5 × 44,90 zł = 224,50 zł/);
    expect(html).toMatch(/274,50 zł/);
  });
});

describe('/dokumenty — tylko dokumenty z panelu', () => {
  const html = renderToStaticMarkup(Dokumenty.default());
  it('linki do panelu prowadzą do istniejących slugów /legal (terms, privacy, cookies, dpa)', () => {
    const slugi = [...html.matchAll(/href="https:\/\/panel\.verris\.pl\/legal\/([a-z]+)"/g)].map((m) => m[1]);
    expect(new Set(slugi)).toEqual(new Set(['terms', 'privacy', 'cookies', 'dpa']));
  });
});

describe('404', () => {
  it('noindex, jedno <h1>, link do strony głównej', () => {
    expect(NotFound.metadata.robots).toEqual({ index: false });
    const html = renderToStaticMarkup(NotFound.default());
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(html).toMatch(/href="\/"/);
  });
});

describe('formularz kontaktu — temat i adres strony w treści', () => {
  it('temat zawsze, adres tylko gdy podany', () => {
    expect(trescKontaktu('Hosting', ' sklep.pl ', ' Pytanie ')).toBe('Temat: Hosting\nStrona: sklep.pl\n\nPytanie');
    expect(trescKontaktu('Domeny', '', 'X')).toBe('Temat: Domeny\n\nX');
  });
});
