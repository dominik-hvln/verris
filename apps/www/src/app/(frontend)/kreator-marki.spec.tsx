/**
 * Paczka 130 — strona /kreator-marki. Istnieje tylko, gdy moduł jest włączony dla wszystkich w panelu admina
 * (GET /public/oferta/kreator-marki); limity i ceny z API (brutto i netto obok siebie), fraza „kreator logo”,
 * uczciwa informacja prawna (TMview, brak obietnic „unikalne/zastrzeżone/gotowe do rejestracji”), JSON-LD z FAQ
 * zgodnym z widocznym, brak linków w menu i sitemapie, dopóki moduł jest ukryty.
 * Na starym kodzie czerwony: strony, parsera oferty ani warunku w sitemapie nie było.
 */
import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { netto, zl } from '@/lib/ceny';
import { parsujOferteMarki, type OfertaMarki } from '@/lib/kreator-marki';
import { footerCols, headerLinks, topLinks } from '@/lib/site';

jest.mock('next/navigation', () => ({
  usePathname: () => null,
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
jest.mock('@/lib/payload', () => ({ getPayloadClient: () => Promise.reject(new Error('brak bazy w teście')) }));
const pobierz = jest.fn<Promise<OfertaMarki | null>, []>();
jest.mock('@/lib/kreator-marki-api', () => ({ pobierzOferteMarki: () => pobierz() }));

/* eslint-disable @typescript-eslint/no-require-imports */
const mod = (): { default: () => Promise<ReactElement>; metadata: Metadata } => require('./kreator-marki/page');
/* eslint-enable @typescript-eslint/no-require-imports */

/** Odpowiedź API przy module włączonym dla wszystkich – celowo inne kwoty niż założenia, żeby wyłapać liczby z kodu. */
const API = {
  dostepny: true,
  wCenieHostingu: { marek: 2, seriiMies: 4, zmianAiMies: 60 },
  pakiet: { brutto: 159, netto: 129.27, serie: 11, zmianyAi: 320, aktualizacjeSzablonowMies: 6 },
  drugaMarka: { brutto: 59, netto: 47.97 },
  pakietWKreatorzeProRocznym: false,
  symboleAi: true,
  maksRozmiarWgraniaMb: 12,
};
const OFERTA = parsujOferteMarki(API)!;

const tekstZ = (html: string) => html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/[ \t\r\n]+/g, ' ');

describe('parser oferty Kreatora marki', () => {
  it('poprawna odpowiedź → oferta; dostepny:false, braki i złe liczby → null (strona ukryta)', () => {
    expect(OFERTA).toEqual({
      wCenieHostingu: { marek: 2, seriiMies: 4, zmianAiMies: 60 },
      pakiet: { brutto: 159, serie: 11, zmianyAi: 320, aktualizacjeSzablonowMies: 6 },
      drugaMarka: { brutto: 59 },
      pakietWKreatorzeProRocznym: false,
      symboleAi: true,
      maksRozmiarWgraniaMb: 12,
    });
    expect(parsujOferteMarki({ dostepny: false })).toBeNull();
    expect(parsujOferteMarki(null)).toBeNull();
    expect(parsujOferteMarki({ ...API, pakiet: { ...API.pakiet, brutto: '159' } })).toBeNull();
    expect(parsujOferteMarki({ ...API, wCenieHostingu: { ...API.wCenieHostingu, marek: 1.5 } })).toBeNull();
    expect(parsujOferteMarki({ ...API, symboleAi: undefined })).toBeNull();
  });
});

describe('/kreator-marki – moduł ukryty', () => {
  it('bez oferty z API strona zwraca 404, a sitemap jej nie ma; brak linków w menu i stopce', async () => {
    pobierz.mockResolvedValue(null);
    await expect(mod().default()).rejects.toThrow('NEXT_NOT_FOUND');
    const { default: sitemap } = await import('../sitemap');
    expect((await sitemap()).map((e) => e.url)).not.toContain('https://verris.pl/kreator-marki');
    expect(JSON.stringify({ headerLinks, topLinks, footerCols })).not.toContain('/kreator-marki');
  });
});

describe('/kreator-marki – moduł włączony dla wszystkich', () => {
  let html = '';
  let tekst = '';
  let jsonLd: Record<string, unknown>[] = [];

  beforeAll(async () => {
    pobierz.mockResolvedValue(OFERTA);
    html = renderToStaticMarkup(await mod().default());
    tekst = tekstZ(html);
    jsonLd = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].flatMap((m) => {
      const d = JSON.parse(m[1]);
      return d['@graph'] ?? [d];
    });
  });

  it('title ≤ 60 z frazą „Kreator logo”, description ≤ 155 bez kwot, canonical; jedno h1, bez h4', () => {
    const { metadata } = mod();
    const title = String(metadata.title);
    expect(title.length).toBeLessThanOrEqual(60);
    expect(title).toMatch(/^Kreator logo/);
    const opis = String(metadata.description);
    expect(opis.length).toBeGreaterThan(50);
    expect(opis.length).toBeLessThanOrEqual(155);
    expect(opis).not.toMatch(/\d+ zł/);
    expect(metadata.alternates?.canonical).toBe('/kreator-marki');
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(html).not.toMatch(new RegExp('<h' + '4[\\s>]'));
    expect(tekst).toMatch(/kreator logo/i);
  });

  it('limity i ceny z API – Pakiet i druga marka brutto z netto obok', () => {
    for (const t of ['2 marki na koncie', '4 serie propozycji', '60 zmian AI', '11 serii propozycji i 320 zmian AI', '6 miesięcy', 'do 12 MB']) expect(tekst).toContain(t);
    expect(tekst).toContain(`${zl(159)} brutto (${zl(netto(159))} netto)`);
    expect(tekst).toContain(`${zl(59)} brutto (${zl(netto(59))} netto)`);
    expect(tekst).toContain('129,27');
    expect(tekst).not.toContain('Kreatorem Pro opłacanym rocznie');
  });

  it('trzy ścieżki, co w cenie hostingu, Pakiet marki, część prawna z TMview, FAQ, CTA', () => {
    for (const t of ['Nowa marka', 'Mam już logo – Key Visual', 'Odświeżenie logo', 'Co dostajesz bez dopłat', 'Logo a znak towarowy', 'Sprawdź nazwę i znak w TMview']) {
      expect(tekst).toContain(t);
    }
    expect(html).toContain('href="https://www.tmdn.org/tmview/"');
    expect(html).toContain('id="pakiet"');
    expect(html).toMatch(/data-cta="ctaband"/);
    expect(html).toMatch(/data-conv="checkout_intent"/);
  });

  it('bez obietnic „unikalne / zastrzeżone / gotowe do rejestracji”, bez twierdzeń środowiskowych, białej etykiety i pauzy', () => {
    expect(tekst).not.toMatch(/unikaln|gotow\p{L}* do rejestracji|sprawdzon\p{L}* w UPRP|gwarantujemy, że (logo|znak)/iu);
    // „zastrzeżony” tylko w zaprzeczeniu.
    for (const m of tekst.matchAll(/.{0,40}zastrzeż\p{L}*/giu)) expect(m[0]).toMatch(/nie znak zastrzeżony|nie jest (znakiem )?zastrzeżon/u);
    expect(tekst).not.toMatch(/ekologi|eko-|zielon\p{L}* energi|neutraln\p{L}* klimatycz|CO2/iu);
    expect(tekst).not.toMatch(/DirectAdmin|CloudLinux|LiteSpeed|Roundcube|2222/);
    expect(tekst).not.toContain('—');
    expect(tekst).not.toMatch(/\bTwój\b.*\bPan\b|\bPaństwa\b/);
  });

  it('JSON-LD: Service z ofertą Pakietu (brutto z API), FAQPage = widoczne FAQ, BreadcrumbList', () => {
    expect(jsonLd.map((w) => w['@type'])).toEqual(expect.arrayContaining(['Service', 'FAQPage', 'BreadcrumbList']));
    const usluga = jsonLd.find((w) => w['@type'] === 'Service') as { offers: { price: string }[] };
    expect(usluga.offers.map((o) => o.price)).toEqual(['159.00']);
    const faq = jsonLd.find((w) => w['@type'] === 'FAQPage') as { mainEntity: { name: string; acceptedAnswer: { text: string } }[] };
    expect(faq.mainEntity.length).toBeGreaterThanOrEqual(6);
    for (const q of faq.mainEntity) {
      expect(tekst).toContain(q.name);
      expect(tekst).toContain(q.acceptedAnswer.text);
    }
  });

  it('Pakiet w Kreatorze Pro rocznym – zdanie tylko, gdy panel tak ustawi; sitemap z /kreator-marki', async () => {
    pobierz.mockResolvedValue({ ...OFERTA, pakietWKreatorzeProRocznym: true });
    expect(tekstZ(renderToStaticMarkup(await mod().default()))).toContain('Z Kreatorem Pro opłacanym rocznie Pakiet marki masz w cenie.');
    const { default: sitemap } = await import('../sitemap');
    expect((await sitemap()).map((e) => e.url)).toContain('https://verris.pl/kreator-marki');
  });
});
