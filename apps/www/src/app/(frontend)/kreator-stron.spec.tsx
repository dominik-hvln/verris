/**
 * Paczka 123 — strona produktu /kreator-stron (Verris Kreator). Strażnik jak dla grup A–D: metadane, jedno h1,
 * JSON-LD (Service z ofertami Kreatora Pro, FAQPage zgodny z widocznym FAQ, BreadcrumbList), ceny z modułu cen
 * (brutto i netto), zrzuty przykładów z podpisem „Przykład – firma fikcyjna”, link w stopce i w sitemapie.
 * Na starym kodzie czerwony: strony, ceny Kreatora Pro w lib/ceny ani linków nie było.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CENY_ZAPASOWE, netto, zl } from '@/lib/ceny';
import { PRZYKLADY_STRON } from '@/lib/kreator';
import { footerCols } from '@/lib/site';

jest.mock('next/navigation', () => ({ usePathname: () => null }));
// sitemap.ts odpytuje Payload o wpisy bloga – w teście bez bazy.
jest.mock('@/lib/payload', () => ({ getPayloadClient: () => Promise.reject(new Error('brak bazy w teście')) }));

/* eslint-disable @typescript-eslint/no-require-imports */
const mod = (): { default: () => Promise<ReactElement>; metadata: Metadata } => require('./kreator-stron/page');
/* eslint-enable @typescript-eslint/no-require-imports */

let html = '';
let tekst = '';
let jsonLd: Record<string, unknown>[] = [];

beforeAll(async () => {
  html = renderToStaticMarkup(await mod().default());
  tekst = html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&quot;/g, '"');
  jsonLd = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].flatMap((m) => {
    const d = JSON.parse(m[1]);
    return d['@graph'] ?? [d];
  });
});

describe('/kreator-stron', () => {
  it('title ≤ 60 z frazą na początku, description ≤ 155 bez kwot, canonical', () => {
    const { metadata } = mod();
    const title = String(metadata.title);
    expect(title.length).toBeLessThanOrEqual(60);
    expect(title).toMatch(/^Kreator stron/);
    const opis = String(metadata.description);
    expect(opis.length).toBeGreaterThan(50);
    expect(opis.length).toBeLessThanOrEqual(155);
    expect(opis).not.toMatch(/\d+ zł/);
    expect(metadata.alternates?.canonical).toBe('/kreator-stron');
  });

  it('jedno <h1>, bez nagłówka 4. poziomu, każdy zrzut ma alt i wymiary', () => {
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(html).not.toMatch(new RegExp('<h' + '4[\\s>]'));
    const obrazy = [...html.matchAll(/<img [^>]*>/g)].map((m) => m[0]);
    expect(obrazy).toHaveLength(PRZYKLADY_STRON.length);
    for (const img of obrazy) {
      expect(img).toMatch(/alt="[^"]{20,}"/);
      expect(img).toMatch(/width="640"/);
      expect(img).toMatch(/height="520"/);
      expect(img).toMatch(/loading="lazy"/);
    }
  });

  it('JSON-LD: Service z ofertami Kreatora Pro (brutto z modułu cen), FAQPage = widoczne FAQ, BreadcrumbList', () => {
    const typy = jsonLd.map((w) => w['@type']);
    expect(typy).toEqual(expect.arrayContaining(['Service', 'FAQPage', 'BreadcrumbList']));
    const usluga = jsonLd.find((w) => w['@type'] === 'Service') as { offers: { price: string }[] };
    expect(usluga.offers.map((o) => o.price)).toEqual([
      CENY_ZAPASOWE.kreatorPro.miesiecznie.toFixed(2),
      CENY_ZAPASOWE.kreatorPro.rocznie.toFixed(2),
    ]);
    const faq = jsonLd.find((w) => w['@type'] === 'FAQPage') as { mainEntity: { name: string; acceptedAnswer: { text: string } }[] };
    expect(faq.mainEntity.length).toBeGreaterThanOrEqual(6);
    for (const q of faq.mainEntity) {
      expect(tekst).toContain(q.name);
      expect(tekst).toContain(q.acceptedAnswer.text);
    }
  });

  it('ceny Kreatora Pro z modułu cen – brutto i netto obok siebie (8,05 i 80,49 zł netto)', () => {
    const kp = CENY_ZAPASOWE.kreatorPro;
    for (const k of [zl(kp.miesiecznie), zl(kp.rocznie), zl(netto(kp.miesiecznie)), zl(netto(kp.rocznie))]) expect(tekst).toContain(k);
    expect(tekst).toContain('8,05\u00a0zł');
    expect(tekst).toContain('80,49\u00a0zł');
    expect(tekst).toContain(zl(CENY_ZAPASOWE.hosting.miesiecznie));
  });

  it('sekcje: jak działa (4 kroki), tabela hosting vs Pro, przykłady, uczciwe zasady, FAQ, CTA do zamówienia', () => {
    for (const t of ['Opisujesz firmę', 'AI proponuje stronę', 'Poprawiasz na stronie', 'Publikujesz na domenie']) expect(tekst).toContain(t);
    expect(html).toMatch(/<table class="cmp2 krt-tabela">/);
    expect(html).toMatch(/<th scope="col">W cenie hostingu<\/th><th scope="col">Kreator Pro<\/th>/);
    expect(html).toContain('id="przyklady"');
    expect(tekst.match(/Przykład – firma fikcyjna/g)).toHaveLength(PRZYKLADY_STRON.length);
    expect(tekst).toContain('AI nie wymyśla faktów');
    expect(tekst).toContain('pobierzesz ją jako ZIP');
    expect(tekst).toContain('Okres próbny – tylko podgląd');
    expect(html).toMatch(/data-cta="ctaband"/);
    expect(html).toMatch(/data-conv="checkout_intent"/);
  });

  it('bez obietnic spoza kodu: WordPress, zmyślone liczby; bez pauzy i białej etykiety', () => {
    expect(tekst).not.toMatch(/WordPress/iu);
    expect(tekst).not.toMatch(/\d+\s?% klientów|tysiące|najlepsz|nr 1|lider/i);
    expect(tekst).not.toContain('—');
    expect(tekst).not.toMatch(/DirectAdmin|CloudLinux|LiteSpeed|2222/);
  });

  it('wersje językowe (paczka 124): wiersz porównania – nie w cenie hostingu, w Pro trzy języki z modelu', () => {
    expect(html).toMatch(/<th scope="row">Wersje językowe<\/th><td data-label="W cenie hostingu">nie<\/td><td data-label="Kreator Pro"[^>]*>(<[^>]+>)*do 3 dodatkowych: angielski, niemiecki, ukraiński – tłumaczenie AI i przełącznik języka/);
    expect(tekst).not.toMatch(/francusk|hiszpańsk|czesk|rosyjsk|wielojęzycz/iu);
  });

  it('zrzuty przykładów są w public/kreator (WebP 640 i 1280), bez plików PNG', () => {
    const katalog = join(__dirname, '../../../public/kreator');
    for (const p of PRZYKLADY_STRON) {
      for (const w of [640, 1280]) {
        const plik = join(katalog, `${p.plik}-${w}.webp`);
        expect(existsSync(plik)).toBe(true);
        expect(readFileSync(plik).subarray(8, 12).toString('latin1')).toBe('WEBP');
      }
    }
  });

  it('link w stopce (kolumna Usługi) i w sitemapie', async () => {
    const uslugi = footerCols.find((k) => k.heading === 'Usługi')!;
    expect(uslugi.links).toContainEqual({ label: 'Kreator stron', href: '/kreator-stron' });
    const { default: sitemap } = await import('../sitemap');
    expect((await sitemap()).map((e) => e.url)).toContain('https://verris.pl/kreator-stron');
  });
});

describe('/cennik i pliki dla AI wymieniają Kreator Pro z ceną z modułu cen', () => {
  it('/cennik ma kartę Kreatora Pro z ceną brutto i netto oraz linkiem do /kreator-stron', async () => {
    const { default: Cennik } = await import('./cennik/page');
    const h = renderToStaticMarkup(await Cennik());
    expect(h).toContain('href="/kreator-stron"');
    expect(h).toContain(zl(netto(CENY_ZAPASOWE.kreatorPro.rocznie)));
  });

  it('/pricing.md i /llms.txt: sekcja kreatora i cena Kreatora Pro', async () => {
    const { GET: pricing } = await import('../pricing.md/route');
    const md = await (await pricing()).text();
    expect(md).toContain('## Verris Kreator');
    expect(md).toContain(`${zl(CENY_ZAPASOWE.kreatorPro.miesiecznie)}/mies. brutto (${zl(netto(CENY_ZAPASOWE.kreatorPro.miesiecznie))} netto)`);
    const { GET: llms } = await import('../llms.txt/route');
    expect(await (await llms()).text()).toContain('https://verris.pl/kreator-stron');
  });
});
