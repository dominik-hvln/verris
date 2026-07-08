// Wspólne helpery structured data (JSON-LD).

export const SITE = 'https://verris.pl';

export const ORG_ID = `${SITE}/#org`;

export const organization = {
  '@type': 'Organization',
  '@id': ORG_ID,
  name: 'Verris',
  url: `${SITE}/`,
  logo: `${SITE}/logo.png`,
  image: `${SITE}/og-default.png`,
  description: 'Polski hosting z autoskalowaniem, VPS i domeny. Operator: HVLN Dominik Kowalski.',
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
  const all: Crumb[] = [{ label: 'Home', href: '/' }, ...items];
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
  { '@type': 'Offer', price: '39.00', priceCurrency: 'PLN', availability: 'https://schema.org/InStock', description: 'Rozliczenie miesięczne, cena brutto' },
  { '@type': 'Offer', price: '349.00', priceCurrency: 'PLN', availability: 'https://schema.org/InStock', description: 'Rozliczenie roczne, cena brutto' },
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
