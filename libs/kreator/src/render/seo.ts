import { jezykiStrony, jezykPodstrony, slugBezJezyka, slugWJezyku, wersjeJezykowe, type Jezyk } from '../jezyki.ts';
import type { Podstrona, Sekcja, SekcjaTypu } from '../model.ts';
import { SCHEMA_DNI } from './dane.ts';
import { esc, jsonBezpieczny } from './esc.ts';
import type { KontekstPodstrony, KontekstStrony } from './kontekst.ts';
import { czyWidoczna } from './sekcje/index.ts';

/** Adres bezwzględny podstrony (gdy znamy adres strony) albo null. */
export function urlPodstrony(s: KontekstStrony, slug: string): string | null {
  if (!s.adres) return null;
  return `${s.adres}/${slug ? slug + '/' : ''}`;
}

export function tytulStrony(s: KontekstStrony, p: Podstrona): string {
  if (p.seo.tytul) return p.seo.tytul;
  if (!p.slug) return s.strona.seo.tytul;
  return `${p.tytul} – ${s.strona.firma.nazwa}`;
}

export function opisStrony(s: KontekstStrony, p: Podstrona): string {
  return p.seo.opis ?? s.strona.seo.opis;
}

/** Favicon: inicjał firmy w kolorach palety, SVG jako data URI (bez dodatkowego pliku). */
export function favicon(s: KontekstStrony): string {
  const p = s.kolory.paleta;
  const inicjal = (s.strona.firma.nazwa.trim().match(/\p{L}|\p{N}/u)?.[0] ?? 'V').toUpperCase();
  const r = s.strona.motyw.zaokraglenie === 'pelne' ? 32 : s.strona.motyw.zaokraglenie === 'ostre' ? 4 : 14;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="${r}" fill="${p.akcent}"/><text x="32" y="43" font-family="Georgia,serif" font-size="34" font-weight="700" text-anchor="middle" fill="${p.naAkcencie}">${esc(inicjal)}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function obrazOg(s: KontekstStrony): string | null {
  const o = s.strona.seo.obrazOg;
  if (!o?.url) return null;
  if (/^https:\/\//i.test(o.url)) return o.url;
  return s.adres ? `${s.adres}/${o.url.replace(/^\/+/, '')}` : null;
}

export interface OpcjeGlowy {
  noindex: boolean;
  /** Ścieżka arkusza i skryptu (z prefiksem podstrony albo od korzenia dla 404). */
  css: string;
  js: string | null;
  preload: string | null;
  artykul: boolean;
  /** Strona 404: bez canonical, og:url, hreflang i danych strukturalnych. */
  bezAdresu?: boolean;
}

/**
 * Alternatywne wersje językowe podstrony do hreflang i sitemap: każda istniejąca wersja (ten sam klucz) + x-default
 * (wersja w języku głównym, a gdy jej nie ma – pierwsza). Jedna wersja = pusta lista (hreflang bez sensu).
 */
export function alternatywy(s: KontekstStrony, p: Podstrona): { hreflang: Jezyk | 'x-default'; url: string }[] {
  if (!s.adres) return [];
  const opublikowane = new Set(s.strona.strony.map((x) => x.slug));
  const wersje = wersjeJezykowe(s.strona, p).filter((w) => opublikowane.has(w.podstrona.slug));
  if (wersje.length < 2) return [];
  const lista = wersje.map((w) => ({ hreflang: w.jezyk as Jezyk | 'x-default', url: urlPodstrony(s, w.podstrona.slug)! }));
  const domyslna = wersje.find((w) => w.jezyk === s.strona.jezyk) ?? wersje[0]!;
  lista.push({ hreflang: 'x-default', url: urlPodstrony(s, domyslna.podstrona.slug)! });
  return lista;
}

export function glowaHtml(k: KontekstPodstrony, o: OpcjeGlowy): string {
  const s = k.s;
  const p = k.podstrona;
  const tytul = tytulStrony(s, p);
  const opis = opisStrony(s, p);
  const url = o.bezAdresu ? null : urlPodstrony(s, p.slug);
  const og = obrazOg(s);
  const lokalizacja: Record<string, string> = { pl: 'pl_PL', en: 'en_GB', de: 'de_DE', uk: 'uk_UA' };
  const w: string[] = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${esc(tytul)}</title>`,
    `<meta name="description" content="${esc(opis)}">`,
  ];
  if (o.noindex) w.push('<meta name="robots" content="noindex, nofollow">');
  if (url) w.push(`<link rel="canonical" href="${esc(url)}">`);
  // hreflang (paczka 124) – tylko między podstronami o tym samym kluczu, które naprawdę istnieją (bez linków do 404),
  // z x-default = wersja w języku głównym strony. Bez adresu strony (podgląd) albo bez SEO pełnego – bez hreflang.
  for (const a of url && s.seoPelne ? alternatywy(s, p) : []) w.push(`<link rel="alternate" hreflang="${a.hreflang}" href="${esc(a.url)}">`);
  w.push(
    `<meta property="og:type" content="${o.artykul ? 'article' : 'website'}">`,
    `<meta property="og:title" content="${esc(tytul)}">`,
    `<meta property="og:description" content="${esc(opis)}">`,
    `<meta property="og:site_name" content="${esc(s.strona.firma.nazwa)}">`,
    `<meta property="og:locale" content="${lokalizacja[k.jezyk] ?? 'pl_PL'}">`,
  );
  if (url) w.push(`<meta property="og:url" content="${esc(url)}">`);
  if (og) w.push(`<meta property="og:image" content="${esc(og)}">`);
  w.push(`<meta name="twitter:card" content="${og ? 'summary_large_image' : 'summary'}">`, `<meta name="twitter:title" content="${esc(tytul)}">`, `<meta name="twitter:description" content="${esc(opis)}">`);
  if (og) w.push(`<meta name="twitter:image" content="${esc(og)}">`);
  w.push(`<meta name="theme-color" content="${s.kolory.paleta.tlo}">`, `<link rel="icon" href="${esc(favicon(s))}">`);
  if (o.preload) w.push(`<link rel="preload" href="${esc(o.preload)}" as="font" type="font/woff2" crossorigin>`);
  w.push(`<link rel="stylesheet" href="${esc(o.css)}">`);
  if (o.js) w.push(`<script src="${esc(o.js)}" defer></script>`);
  if (!o.bezAdresu) w.push(`<script type="application/ld+json">${jsonBezpieczny(jsonLd(k))}</script>`);
  return w.join('\n');
}

const SPOLKI_BEZ_GODZIN = new Set(['Organization', 'Person', 'EducationalOrganization']);

function firmaLd(s: KontekstStrony): Record<string, unknown> {
  const f = s.strona.firma;
  const ld: Record<string, unknown> = { '@type': f.typSchema, '@id': `${s.adres ?? ''}/#firma`, name: f.nazwa, description: f.opisKrotki };
  if (s.adres) ld.url = `${s.adres}/`;
  if (f.adres) ld.address = { '@type': 'PostalAddress', streetAddress: f.adres.ulica, postalCode: f.adres.kod, addressLocality: f.adres.miasto, addressCountry: 'PL' };
  if (f.telefon) ld.telephone = f.telefon;
  if (f.email) ld.email = f.email;
  if (f.obszar && f.typSchema !== 'Person') ld.areaServed = f.obszar;
  if (f.godziny.length && !SPOLKI_BEZ_GODZIN.has(f.typSchema)) {
    ld.openingHoursSpecification = f.godziny.map((g) => ({ '@type': 'OpeningHoursSpecification', dayOfWeek: g.dni.map((d) => SCHEMA_DNI[d]), opens: g.od, closes: g.do }));
  }
  if (f.social.length) ld.sameAs = f.social.map((x) => x.url);
  return ld;
}

const DOSTEPNOSC_LD: Record<string, string> = {
  dostepny: 'https://schema.org/InStock',
  ostatnie: 'https://schema.org/LimitedAvailability',
  niedostepny: 'https://schema.org/OutOfStock',
  'na-zamowienie': 'https://schema.org/MadeToOrder',
};

function bezwzgl(s: KontekstStrony, sciezka: string | undefined): string | undefined {
  if (!sciezka) return undefined;
  if (/^https:\/\//i.test(sciezka)) return sciezka;
  return s.adres ? `${s.adres}/${sciezka.replace(/^\/+/, '')}` : undefined;
}

/**
 * Dane strukturalne. Zawsze: WebSite + firma (typSchema). SEO pełne (Pro): FAQPage, Product z Offer
 * w PLN, BlogPosting, BreadcrumbList na podstronach. Opinie NIGDY nie dają AggregateRating/Review.
 */
export function jsonLd(k: KontekstPodstrony): Record<string, unknown> {
  const s = k.s;
  const p = k.podstrona;
  const graf: Record<string, unknown>[] = [];
  // inLanguage: języki całej witryny (WebSite) i język tej podstrony (WebPage) – paczka 124.
  const jezyki = jezykiStrony(s.strona).filter((j) => s.strona.strony.some((x) => jezykPodstrony(s.strona, x) === j));
  const witryna: Record<string, unknown> = { '@type': 'WebSite', name: s.strona.firma.nazwa, inLanguage: jezyki.length > 1 ? jezyki : s.strona.jezyk, publisher: { '@id': `${s.adres ?? ''}/#firma` } };
  if (s.adres) witryna.url = `${s.adres}/`;
  graf.push(witryna, firmaLd(s));
  const strona: Record<string, unknown> = { '@type': 'WebPage', name: tytulStrony(s, p), inLanguage: k.jezyk };
  const url = urlPodstrony(s, p.slug);
  if (url) strona.url = url;
  graf.push(strona);
  if (s.seoPelne) {
    const sekcje = p.sekcje.filter((x) => czyWidoczna(s, x));
    const faq = sekcje.filter((x): x is SekcjaTypu<'faq'> => x.typ === 'faq').flatMap((x) => x.dane.pytania);
    if (faq.length) {
      graf.push({ '@type': 'FAQPage', mainEntity: faq.map((q) => ({ '@type': 'Question', name: q.pytanie, acceptedAnswer: { '@type': 'Answer', text: q.odpowiedz } })) });
    }
    for (const sek of sekcje.filter((x): x is SekcjaTypu<'produkty'> => x.typ === 'produkty')) {
      for (const pr of sek.dane.produkty) {
        const prod: Record<string, unknown> = {
          '@type': 'Product',
          name: pr.nazwa,
          offers: { '@type': 'Offer', price: pr.cenaBrutto.toFixed(2), priceCurrency: 'PLN', availability: DOSTEPNOSC_LD[pr.dostepnosc], seller: { '@id': `${s.adres ?? ''}/#firma` } },
        };
        if (pr.opis) prod.description = pr.opis;
        if (pr.sku) prod.sku = pr.sku;
        const img = bezwzgl(s, pr.obraz?.url);
        if (img) prod.image = img;
        graf.push(prod);
      }
    }
    for (const sek of sekcje.filter((x): x is SekcjaTypu<'blog'> => x.typ === 'blog')) {
      for (const w of sek.dane.wpisy) graf.push(blogPosting(s, w, k.jezyk));
    }
    const wpis = wpisDlaPodstrony(s, p);
    if (wpis) graf.push({ ...blogPosting(s, wpis, k.jezyk), mainEntityOfPage: urlPodstrony(s, p.slug) ?? undefined });
    if (p.slug !== slugWJezyku(s.strona, k.jezyk, '')) graf.push(okruszki(s, p, k.jezyk));
  }
  return { '@context': 'https://schema.org', '@graph': graf };
}

type Wpis = SekcjaTypu<'blog'>['dane']['wpisy'][number];

function blogPosting(s: KontekstStrony, w: Wpis, jezyk: Jezyk): Record<string, unknown> {
  const ld: Record<string, unknown> = { '@type': 'BlogPosting', headline: w.tytul, description: w.lead, datePublished: w.data, inLanguage: jezyk, author: { '@id': `${s.adres ?? ''}/#firma` } };
  const slug = slugWJezyku(s.strona, jezyk, `blog/${w.slug}`);
  const url = urlPodstrony(s, slug);
  if (url && s.strona.strony.some((x) => x.slug === slug)) ld.url = url;
  const img = bezwzgl(s, w.obraz?.url);
  if (img) ld.image = img;
  return ld;
}

/** Wpis bloga odpowiadający podstronie `blog/<slug>` (`en/blog/<slug>` w wersji językowej) – zajawka z sekcji blog tego języka. */
export function wpisDlaPodstrony(s: KontekstStrony, p: Podstrona): Wpis | null {
  const wzgl = slugBezJezyka(s.strona, p);
  if (!wzgl.startsWith('blog/')) return null;
  const slug = wzgl.slice(5);
  const jezyk = jezykPodstrony(s.strona, p);
  for (const sek of s.strona.strony.filter((x) => jezykPodstrony(s.strona, x) === jezyk).flatMap((x) => x.sekcje)) {
    if (sek.typ === 'blog') {
      const w = sek.dane.wpisy.find((x) => x.slug === slug);
      if (w) return w;
    }
  }
  return null;
}

function okruszki(s: KontekstStrony, p: Podstrona, jezyk: Jezyk): Record<string, unknown> {
  const czesci = slugBezJezyka(s.strona, p).split('/');
  const glowna = slugWJezyku(s.strona, jezyk, '');
  const elementy: { name: string; slug: string }[] = [{ name: s.strona.strony.find((x) => x.slug === glowna)?.tytul ?? 'Start', slug: glowna }];
  if (czesci.length > 1) {
    const rodzic = s.strona.strony.find((x) => x.slug === slugWJezyku(s.strona, jezyk, czesci[0]!));
    if (rodzic) elementy.push({ name: rodzic.tytul, slug: rodzic.slug });
  }
  elementy.push({ name: p.tytul, slug: p.slug });
  return {
    '@type': 'BreadcrumbList',
    itemListElement: elementy.map((e, i) => ({ '@type': 'ListItem', position: i + 1, name: e.name, item: urlPodstrony(s, e.slug) ?? `/${e.slug ? e.slug + '/' : ''}` })),
  };
}

/**
 * sitemap.xml; wersje językowe (paczka 124) – każdy adres z `xhtml:link rel="alternate"` do wszystkich istniejących
 * wersji (także do siebie) i x-default, jak w hreflang nagłówka (Google: sitemap z alternates).
 */
export function sitemap(s: KontekstStrony, strony: Podstrona[]): string {
  const data = s.dataIso.slice(0, 10);
  let zAlternatywami = false;
  const wpisy = s.adres
    ? strony.map((p) => {
        const alt = s.seoPelne ? alternatywy(s, p) : [];
        if (alt.length) zAlternatywami = true;
        const linki = alt.map((a) => `<xhtml:link rel="alternate" hreflang="${a.hreflang}" href="${esc(a.url)}"/>`).join('');
        return `<url><loc>${esc(urlPodstrony(s, p.slug) ?? '')}</loc><lastmod>${data}</lastmod>${linki}</url>`;
      })
    : [];
  if (!s.adres) s.ostrzezenia.push('Brak adresu strony – sitemap.xml bez adresów (uzupełni się po podpięciu domeny).');
  const xhtml = zAlternatywami ? ' xmlns:xhtml="http://www.w3.org/1999/xhtml"' : '';
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${xhtml}>\n${wpisy.join('\n')}${wpisy.length ? '\n' : ''}</urlset>\n`;
}

export function robots(s: KontekstStrony, noindex: boolean): string {
  if (noindex) return 'User-agent: *\nDisallow: /\n';
  return `User-agent: *\nAllow: /\n${s.adres ? `\nSitemap: ${s.adres}/sitemap.xml\n` : ''}`;
}

export type { Sekcja };
