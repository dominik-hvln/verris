import type { MetadataRoute } from 'next';
import { features } from '@/lib/features';
import { getPayloadClient } from '@/lib/payload';

const BASE = 'https://verris.pl';

// Sitemap musi odpytywać bazę w RUNTIME, nie w buildzie (wtedy DB nie ma → brak wpisów bloga).
// ISR: odświeża się co godzinę, więc nowe wpisy pojawiają się automatycznie.
export const revalidate = 3600;

const STATIC = [
  '/',
  '/hosting',
  '/hosting/wordpress',
  '/hosting/sklep',
  '/poczta',
  '/vps',
  '/domeny',
  '/email-marketing',
  '/reseller',
  '/funkcje',
  '/cennik',
  '/blog',
  '/o-nas',
  '/kontakt',
  '/przenies-strone',
];

async function blogEntries(): Promise<{ path: string; lastmod?: string }[]> {
  try {
    const payload = await getPayloadClient();
    const res = await payload.find({ collection: 'posts', limit: 500, depth: 0 });
    // Payload typuje `docs` jako (JsonObject & TypeWithID)[]. Adnotacja parametru
    // callbacku węższym kształtem to błąd typu (TS2769/TS2345) — TypeScript nie
    // pozwala zawęzić parametru w miejscu wywołania. Zawężamy więc całą tablicę
    // raz, a callbacki zostają bez adnotacji.
    const docs = res.docs as Array<{ slug?: string; updatedAt?: string }>;
    return docs
      .filter((d) => d.slug)
      .map((d) => ({ path: `/blog/${d.slug}`, lastmod: d.updatedAt }));
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const staticEntries = [...STATIC, ...features.map((f) => `/funkcje/${f.slug}`)].map((p) => ({
    url: `${BASE}${p}`,
    lastModified: now,
    changeFrequency: 'weekly' as const,
    priority: p === '/' ? 1 : 0.7,
  }));
  const blog = (await blogEntries()).map((e) => ({
    url: `${BASE}${e.path}`,
    lastModified: e.lastmod ? new Date(e.lastmod) : now,
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }));
  return [...staticEntries, ...blog];
}
