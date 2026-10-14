// Wspólne helpery structured data (JSON-LD).
import { OFERTA_KROTKO } from './oferta';

export const SITE = 'https://verris.pl';

export const ORG_ID = `${SITE}/#org`;

export const organization = {
  '@type': 'Organization',
  '@id': ORG_ID,
  name: 'Verris',
  url: `${SITE}/`,
  logo: `${SITE}/logo.png`,
  image: `${SITE}/og-default.png`,
  description: `Polski ${OFERTA_KROTKO}. Operator: HVLN Dominik Kowalski.`,
  slogan: 'Skaluj świadomie.',
  areaServed: 'PL',
  vatID: 'PL9292069367',
  address: {
    '@type': 'PostalAddress',
    addressLocality: 'Zielona Góra',
    addressCountry: 'PL',
  },
  contactPoint: {
    '@type': 'ContactPoint',
    email: 'kontakt@verris.pl',
    contactType: 'customer support',
    availableLanguage: ['pl'],
  },
  // Uzupełnić realnymi profilami, gdy powstaną (LinkedIn, Facebook, GitHub…):
  sameAs: [] as string[],
};

type Crumb = { label: string; href?: string };

export function breadcrumbList(items: Crumb[]) {
  const all: Crumb[] = [{ label: 'Strona główna', href: '/' }, ...items];
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: all.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.label,
      ...(c.href ? { item: `${SITE}${c.href}` } : {}),
    })),
  };
}

export function serviceSchema(args: {
  name: string;
  description: string;
  path: string;
  offers?: object[];
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    serviceType: args.name,
    name: args.name,
    description: args.description,
    provider: { '@id': ORG_ID },
    areaServed: 'PL',
    url: `${SITE}${args.path}`,
    ...(args.offers ? { offers: args.offers } : {}),
  };
}

export const HOSTING_OFFERS = [
  { '@type': 'Offer', price: '45.00', priceCurrency: 'PLN', availability: 'https://schema.org/InStock', description: 'Rozliczenie miesięczne, cena brutto' },
  { '@type': 'Offer', price: '449.00', priceCurrency: 'PLN', availability: 'https://schema.org/InStock', description: 'Rozliczenie roczne, cena brutto' },
];

export function faqSchema(qa: [string, string][]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: qa.map(([q, a]) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };
}

export function articleSchema(args: {
  title: string;
  slug: string;
  description?: string;
  image?: string;
  datePublished?: string;
  dateModified?: string;
  author?: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: args.title,
    description: args.description,
    ...(args.image ? { image: args.image.startsWith('http') ? args.image : `${SITE}${args.image}` } : {}),
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${SITE}/blog/${args.slug}` },
    datePublished: args.datePublished,
    dateModified: args.dateModified || args.datePublished,
    author: { '@type': args.author ? 'Person' : 'Organization', name: args.author || 'Verris' },
    publisher: { '@id': ORG_ID },
  };
}

/**
 * Grupa D (makieta 14.10) — strona informacyjna: WebPage, AboutPage, ContactPage albo CollectionPage.
 * `extra` dokleja pola typu (np. mainEntity, hasPart). Wydawca zawsze przez @id organizacji.
 */
export function webPageSchema(args: {
  type?: 'WebPage' | 'AboutPage' | 'ContactPage' | 'CollectionPage';
  name: string;
  description: string;
  path: string;
  extra?: Record<string, unknown>;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': args.type ?? 'WebPage',
    name: args.name,
    description: args.description,
    url: `${SITE}${args.path}`,
    inLanguage: 'pl-PL',
    isPartOf: { '@type': 'WebSite', url: `${SITE}/`, name: 'Verris' },
    publisher: { '@id': ORG_ID },
    ...(args.extra ?? {}),
  };
}

/** Product z parametrami (additionalProperty) i ofertami brutto — /specyfikacja (makieta 14.10). */
export function productSpecSchema(args: {
  name: string;
  description: string;
  path: string;
  properties: [string, string][];
  offers?: object[];
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: args.name,
    description: args.description,
    url: `${SITE}${args.path}`,
    brand: { '@type': 'Brand', name: 'Verris' },
    additionalProperty: args.properties.map(([name, value]) => ({ '@type': 'PropertyValue', name, value })),
    ...(args.offers ? { offers: args.offers } : {}),
  };
}

/**
 * HowTo (makieta 14.10: /przenies-strone, poradniki przeprowadzki, przywracanie kopii). Kroki jako zwykły tekst.
 * `kotwice` — strona ma sekcje `#krok-N` (domyślnie tak); bez nich kroki nie dostają adresu.
 */
export function howToSchema(args: {
  name: string;
  description?: string;
  path: string;
  steps: { name: string; text: string }[];
  totalTime?: string;
  kotwice?: boolean;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: args.name,
    ...(args.description ? { description: args.description } : {}),
    url: `${SITE}${args.path}`,
    ...(args.totalTime ? { totalTime: args.totalTime } : {}),
    estimatedCost: { '@type': 'MonetaryAmount', currency: 'PLN', value: '0' },
    step: args.steps.map((s, i) => ({
      '@type': 'HowToStep',
      position: i + 1,
      name: s.name,
      text: s.text,
      ...(args.kotwice === false ? {} : { url: `${SITE}${args.path}#krok-${i + 1}` }),
    })),
  };
}

/** Article dla przewodników poza blogiem (np. /jak-wybrac-hosting) — articleSchema zakłada adres /blog/…. */
export function guideSchema(args: {
  title: string;
  description: string;
  path: string;
  datePublished: string;
  dateModified: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: args.title,
    description: args.description,
    image: `${SITE}/og-default.png`,
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${SITE}${args.path}` },
    datePublished: args.datePublished,
    dateModified: args.dateModified,
    author: { '@type': 'Organization', '@id': ORG_ID, name: 'Verris', url: `${SITE}/` },
    publisher: { '@id': ORG_ID },
    inLanguage: 'pl-PL',
  };
}

/** ItemList — numerowana lista (np. lista kontrolna przewodnika). */
export function itemListSchema(name: string, items: string[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    itemListElement: items.map((t, i) => ({ '@type': 'ListItem', position: i + 1, name: t })),
  };
}

/** Kilka węzłów JSON-LD w jednym `@graph` (helpery wyżej zwracają węzły z własnym `@context`). */
export function graph(...nodes: object[]) {
  return {
    '@context': 'https://schema.org',
    '@graph': nodes.map((n) => {
      const kopia: Record<string, unknown> = { ...n };
      delete kopia['@context'];
      return kopia;
    }),
  };
}
