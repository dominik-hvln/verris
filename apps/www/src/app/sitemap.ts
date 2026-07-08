import type { MetadataRoute } from 'next';
import { features } from '@/lib/features';
import { getPayloadClient } from '@/lib/payload';

const BASE = 'https://verris.pl';

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
    return res.docs
      .filter((d: { slug?: string }) => d.slug)
      .map((d: { slug?: string; updatedAt?: string }) => ({ path: `/blog/${d.slug}`, lastmod: d.updatedAt }));
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
