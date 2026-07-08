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
  '/pomoc',
  '/o-nas',
  '/kontakt',
  '/przenies-strone',
];

async function blogPaths(): Promise<string[]> {
  try {
    const payload = await getPayloadClient();
    const res = await payload.find({ collection: 'posts', limit: 500, depth: 0 });
    return res.docs.map((d: { slug?: string }) => `/blog/${d.slug}`).filter(Boolean);
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const paths = [...STATIC, ...features.map((f) => `/funkcje/${f.slug}`), ...(await blogPaths())];
  return paths.map((p) => ({
    url: `${BASE}${p}`,
    changeFrequency: 'weekly',
    priority: p === '/' ? 1 : 0.7,
  }));
}
