/**
 * Grupa B makiety 14.10 — strażnik SEO i struktury stron: przeniesienie strony, poradniki przeprowadzki,
 * jak wybrać hosting, domeny, poczta, VPS. Sprawdza limity metadanych, jedno h1, brak nagłówków poziomu 4 i typy JSON-LD.
 */
import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

jest.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

function tekst(v: Metadata['title'] | Metadata['description']): string {
  return typeof v === 'string' ? v : '';
}

/** Wszystkie `@type` z bloków JSON-LD (także z `@graph`). */
function typyJsonLd(html: string): string[] {
  const typy: string[] = [];
  for (const m of html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)) {
    const dane = JSON.parse(m[1]);
    const wezly = dane['@graph'] ?? [dane];
    for (const w of wezly) typy.push(w['@type']);
  }
  return typy;
}

export function sprawdzStrone(args: {
  html: string;
  meta: Metadata;
  fraza: RegExp;
  typy: string[];
  canonical: string;
}) {
  const title = tekst(args.meta.title);
  const description = tekst(args.meta.description);
  expect(title.length).toBeGreaterThan(10);
  expect(title.length).toBeLessThanOrEqual(60);
  expect(description.length).toBeGreaterThan(50);
  expect(description.length).toBeLessThanOrEqual(155);
  expect(title).toMatch(args.fraza);
  expect(args.meta.alternates?.canonical).toBe(args.canonical);
  expect(args.html.match(/<h1[\s>]/g)?.length).toBe(1);
  // Wzorzec składany, żeby a11y.spec.ts (szuka tego znacznika w plikach .tsx) nie trafił na sam test.
  expect(args.html).not.toMatch(new RegExp('<h' + '4[\\s>]'));
  const typy = typyJsonLd(args.html);
  for (const t of args.typy) expect(typy).toContain(t);
  // Twarde zasady treści (brief 14.10): white label i zakazane obietnice.
  expect(args.html).not.toMatch(/2222|CloudLinux|CustomBuild|gotowe na KSeF|100% uptime|Niemcy|Finlandi/i);
}

async function render(el: ReactElement | Promise<ReactElement>) {
  return renderToStaticMarkup(await el);
}

describe('grupa B — /przenies-strone', () => {
  it('metadane, jedno h1, HowTo z 6 krokami, FAQPage, BreadcrumbList i kotwica #poradniki', async () => {
    const mod = await import('./przenies-strone/page');
    const html = await render(mod.default());
    sprawdzStrone({
      html,
      meta: mod.metadata,
      fraza: /^Przeniesienie strony/,
      typy: ['HowTo', 'FAQPage', 'BreadcrumbList'],
      canonical: '/przenies-strone',
    });
    const howTo = JSON.parse(html.match(/"@graph":\[(\{"@type":"HowTo".*?\}\]\})/s)![1]);
    expect(howTo.step).toHaveLength(6);
    expect(html).toContain('id="poradniki"');
    for (const s of ['z-cpanel', 'z-directadmin', 'z-plesk', 'z-ftp']) expect(html).toContain(`href="/przenies-strone/${s}"`);
    // Formularz leada zostaje (analityka generate_lead w MigrationLeadForm).
    expect(html).toContain('type="email"');
  });
});

describe('grupa B — poradniki /przenies-strone/[zrodlo]', () => {
  it('generateStaticParams daje cztery źródła, bez marek hostingów', async () => {
    const mod = await import('./przenies-strone/[zrodlo]/page');
    expect(mod.generateStaticParams().map((p) => p.zrodlo)).toEqual(['z-cpanel', 'z-directadmin', 'z-plesk', 'z-ftp']);
    expect(mod.dynamicParams).toBe(false);
  });

  it.each(['z-cpanel', 'z-directadmin', 'z-plesk', 'z-ftp'])('%s: metadane, h1, HowTo + FAQPage + BreadcrumbList, CTA', async (zrodlo) => {
    const mod = await import('./przenies-strone/[zrodlo]/page');
    const params = Promise.resolve({ zrodlo });
    const meta = await mod.generateMetadata({ params });
    const html = await render(mod.default({ params }));
    sprawdzStrone({ html, meta, fraza: /^Jak przenieść stronę/, typy: ['HowTo', 'FAQPage', 'BreadcrumbList'], canonical: `/przenies-strone/${zrodlo}` });
    expect(html).toContain('Przenieś za darmo');
    // Linki do pozostałych poradników.
    for (const s of ['z-cpanel', 'z-directadmin', 'z-plesk', 'z-ftp'].filter((x) => x !== zrodlo)) {
      expect(html).toContain(`href="/przenies-strone/${s}"`);
    }
    // Bez marek konkretnych hostingów (nie wiemy, jakiego panelu używają).
    expect(html).not.toMatch(/home\.pl|nazwa\.pl|cyber_?Folks|dhosting|OVH|Zenbox|Hostinger|Seohost|LH\.pl/i);
  });

  it('nieznane źródło → 404', async () => {
    const mod = await import('./przenies-strone/[zrodlo]/page');
    await expect(mod.default({ params: Promise.resolve({ zrodlo: 'z-home-pl' }) })).rejects.toThrow('NEXT_NOT_FOUND');
  });
});

describe('grupa B — /jak-wybrac-hosting', () => {
  it('metadane, jedno h1, Article + ItemList(10) + FAQPage + BreadcrumbList, data aktualizacji', async () => {
    const mod = await import('./jak-wybrac-hosting/page');
    const html = await render(mod.default());
    sprawdzStrone({
      html,
      meta: mod.metadata,
      fraza: /^Jak wybrać hosting/,
      typy: ['Article', 'ItemList', 'FAQPage', 'BreadcrumbList'],
      canonical: '/jak-wybrac-hosting',
    });
    const lista = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)![1])['@graph'].find(
      (w: { '@type': string }) => w['@type'] === 'ItemList',
    );
    expect(lista.itemListElement).toHaveLength(10);
    expect(html).toMatch(/<time dateTime="2026-\d\d-\d\d"/i);
    expect(html).toContain('id="lista"');
  });
});

describe('grupa B — /domeny', () => {
  it('metadane, h1, Service + FAQPage + BreadcrumbList; wyszukiwarka to formularz GET do panelu, bez udawanych wyników i [cena]', async () => {
    const mod = await import('./domeny/page');
    const html = await render(mod.default());
    sprawdzStrone({ html, meta: mod.metadata, fraza: /^Domeny/, typy: ['Service', 'FAQPage', 'BreadcrumbList'], canonical: '/domeny' });
    expect(html).toMatch(/<form action="https:\/\/panel\.verris\.pl\/dashboard\/domains\/buy" method="get">/);
    expect(html).toContain('name="domain"');
    expect(html).not.toMatch(/\[cena\]|\[do decyzji/);
    expect(html).toContain('id="transfer"');
  });
});
