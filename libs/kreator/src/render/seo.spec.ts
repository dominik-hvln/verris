import { WERSJE_KREATORA } from '../plany.ts';
import { ADRES, blokiLd, grafLd, htmle, model, plik, PRZYKLADY, render, typyLd, znaczniki } from './testy.pomoc.ts';

const PELNE = ['FAQPage', 'Product', 'BlogPosting', 'BreadcrumbList'];

describe('JSON-LD', () => {
  it.each(Object.keys(PRZYKLADY).flatMap((n) => WERSJE_KREATORA.map((w) => [n, w] as const)))('%s / %s: parsuje się i ma firmę z typSchema', (nazwa, wersja) => {
    const wynik = render(PRZYKLADY[nazwa]!, wersja);
    const firma = model(PRZYKLADY[nazwa]!).firma;
    for (const { sciezka, tresc } of htmle(wynik)) {
      if (sciezka === '404.html') {
        expect(blokiLd(tresc)).toHaveLength(0);
        continue;
      }
      const graf = grafLd(tresc);
      const f = graf.find((x) => x['@type'] === firma.typSchema)!;
      expect(f, `${sciezka}: brak ${firma.typSchema}`).toBeTruthy();
      expect(f.name).toBe(firma.nazwa);
      expect(f['@id']).toBe(`${ADRES}/#firma`);
      expect(f.address).toMatchObject({ '@type': 'PostalAddress', streetAddress: 'ul. Przykładowa 12', addressCountry: 'PL' });
      expect(graf.find((x) => x['@type'] === 'WebSite')).toMatchObject({ url: `${ADRES}/`, publisher: { '@id': `${ADRES}/#firma` } });
      const json = JSON.stringify(graf);
      expect(json).not.toMatch(/AggregateRating|"Review"/);
      if (wersja !== 'pro') for (const t of PELNE) expect(typyLd(tresc), `${sciezka}: ${t} w SEO podstawowym`).not.toContain(t);
    }
  });

  it('pełne SEO (pro): FAQPage z pytaniami z modelu', () => {
    const typy = typyLd(plik(render(PRZYKLADY.ksiegowa!, 'pro'), 'index.html'));
    expect(typy).toContain('FAQPage');
    const faq = grafLd(plik(render(PRZYKLADY.ksiegowa!, 'pro'), 'index.html')).find((x) => x['@type'] === 'FAQPage') as { mainEntity: { name: string; acceptedAnswer: { text: string } }[] };
    expect(faq.mainEntity).toHaveLength(4);
    expect(faq.mainEntity[0]).toMatchObject({ name: 'Czy muszę przywozić dokumenty do biura?', acceptedAnswer: { '@type': 'Answer' } });
    expect(typy).not.toContain('Product');
    expect(typy).not.toContain('BreadcrumbList');
  });

  it('pełne SEO (pro): Product z ofertą w PLN i dostępnością; bez FAQ nie ma FAQPage', () => {
    const graf = grafLd(plik(render(PRZYKLADY.ceramika!, 'pro'), 'index.html'));
    const produkty = graf.filter((x) => x['@type'] === 'Product');
    expect(produkty).toHaveLength(6);
    expect(produkty[0]).toMatchObject({ name: 'Kubek poranny – szkliwo piaskowe', sku: 'GO-KUB-01', offers: { price: '89.00', priceCurrency: 'PLN', availability: 'https://schema.org/InStock' } });
    expect(produkty[4]).toMatchObject({ offers: { availability: 'https://schema.org/OutOfStock' } });
    expect(graf.map((x) => x['@type'])).not.toContain('FAQPage');
  });

  it('pełne SEO (pro): BlogPosting na stronie głównej i we wpisie, BreadcrumbList na podstronie', () => {
    const wynik = render(PRZYKLADY.studio!, 'pro');
    const glowna = grafLd(plik(wynik, 'index.html'));
    const wpisy = glowna.filter((x) => x['@type'] === 'BlogPosting');
    expect(wpisy).toHaveLength(3);
    expect(wpisy[0]).toMatchObject({ headline: 'Mała kuchnia bez kompromisów', datePublished: '2026-10-21', url: `${ADRES}/blog/mala-kuchnia-bez-kompromisow/` });
    expect(wpisy[1]!.url).toBeUndefined(); // wpis bez własnej podstrony nie dostaje adresu
    expect(glowna.map((x) => x['@type'])).not.toContain('BreadcrumbList');

    const podstrona = plik(wynik, 'blog/mala-kuchnia-bez-kompromisow/index.html');
    const graf = grafLd(podstrona);
    expect(graf.find((x) => x['@type'] === 'BlogPosting')).toMatchObject({ mainEntityOfPage: `${ADRES}/blog/mala-kuchnia-bez-kompromisow/` });
    expect(graf.find((x) => x['@type'] === 'BreadcrumbList')).toMatchObject({
      itemListElement: [
        { position: 1, name: 'Start', item: `${ADRES}/` },
        { position: 2, name: 'Mała kuchnia bez kompromisów', item: `${ADRES}/blog/mala-kuchnia-bez-kompromisow/` },
      ],
    });
    const og = znaczniki(podstrona).find((t) => t.atr.property === 'og:type');
    expect(og?.atr.content).toBe('article');
    expect(podstrona).toContain(`<link rel="canonical" href="${ADRES}/blog/mala-kuchnia-bez-kompromisow/">`);
  });
});

describe('indeksowanie', () => {
  it.each(Object.keys(PRZYKLADY))('%s: próba zawsze noindex (meta robots + robots.txt), pusta sitemap', (nazwa) => {
    const wynik = render(PRZYKLADY[nazwa]!, 'proba');
    for (const { tresc } of htmle(wynik)) expect(tresc).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(plik(wynik, 'robots.txt')).toBe('User-agent: *\nDisallow: /\n');
    expect(plik(wynik, 'sitemap.xml')).not.toContain('<loc>');
  });

  it.each(Object.keys(PRZYKLADY).flatMap((n) => (['hosting', 'pro'] as const).map((w) => [n, w] as const)))('%s / %s: bez noindex, robots.txt z adresem sitemap', (nazwa, wersja) => {
    const wynik = render(PRZYKLADY[nazwa]!, wersja);
    for (const { sciezka, tresc } of htmle(wynik)) {
      if (sciezka === '404.html') expect(tresc).toContain('noindex');
      else expect(tresc, sciezka).not.toContain('noindex');
    }
    expect(plik(wynik, 'robots.txt')).toBe(`User-agent: *\nAllow: /\n\nSitemap: ${ADRES}/sitemap.xml\n`);
  });

  it('noindex: true wymusza noindex także w wersji pro', () => {
    const wynik = render(PRZYKLADY.salon!, 'pro', { noindex: true });
    expect(plik(wynik, 'index.html')).toContain('noindex');
    expect(plik(wynik, 'robots.txt')).toContain('Disallow: /');
  });

  it.each(Object.keys(PRZYKLADY).flatMap((n) => (['hosting', 'pro'] as const).map((w) => [n, w] as const)))('%s / %s: sitemap zawiera każdą podstronę (bez 404)', (nazwa, wersja) => {
    const wynik = render(PRZYKLADY[nazwa]!, wersja);
    const sitemap = plik(wynik, 'sitemap.xml');
    const loc = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    const oczekiwane = htmle(wynik)
      .filter((p) => p.sciezka !== '404.html')
      .map((p) => `${ADRES}/${p.sciezka.replace(/index\.html$/, '')}`);
    expect(loc.sort()).toEqual(oczekiwane.sort());
    expect(sitemap).toContain('<lastmod>2026-11-07</lastmod>');
    expect(sitemap.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  });

  it('studio w pro: sitemap z podstroną wpisu; w hosting wpis nie jest publikowany', () => {
    expect(plik(render(PRZYKLADY.studio!, 'pro'), 'sitemap.xml')).toContain(`<loc>${ADRES}/blog/mala-kuchnia-bez-kompromisow/</loc>`);
    const hosting = render(PRZYKLADY.studio!, 'hosting');
    expect(hosting.pliki.map((p) => p.sciezka)).not.toContain('blog/mala-kuchnia-bez-kompromisow/index.html');
    expect(plik(hosting, 'sitemap.xml')).not.toContain('/blog/');
  });

  it('bez adresu strony: bez canonical i og:url, sitemap bez adresów + ostrzeżenie', () => {
    const wynik = render(PRZYKLADY.ksiegowa!, 'pro', { adresStrony: undefined });
    const html = plik(wynik, 'index.html');
    expect(html).not.toContain('rel="canonical"');
    expect(html).not.toContain('og:url');
    expect(plik(wynik, 'sitemap.xml')).not.toContain('<loc>');
    expect(wynik.ostrzezenia.join(' ')).toContain('Brak adresu strony');
  });

  it('hreflang tylko do istniejących wersji językowych (paczka 124: wersja bez strony głównej jest błędem modelu)', () => {
    const w = structuredClone(PRZYKLADY.ksiegowa!) as { jezykiDodatkowe?: string[]; strony: { slug: string; tytul: string }[] };
    w.jezykiDodatkowe = ['en'];
    expect(() => render(w as never, 'pro')).toThrow(/nie ma strony głównej/);
    w.strony.push({ ...structuredClone(w.strony[0]!), slug: 'en', tytul: 'Home' });
    const html = plik(render(w as never, 'pro'), 'index.html');
    expect(html).toContain(`<link rel="alternate" hreflang="en" href="${ADRES}/en/">`);
    expect(html).toContain('hreflang="x-default"');
  });
});
