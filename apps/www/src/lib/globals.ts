import { unstable_cache } from 'next/cache';
import { getPayloadClient } from './payload';

// Cache'owane odczyty globalsów Payload — front pozostaje ISR (revalidate),
// a zmiany w CMS pojawiają się w ciągu ~60 s. Przy braku bazy (np. build) → null.
export const getFooterGlobal = unstable_cache(
  async () => {
    try {
      const payload = await getPayloadClient();
      return await payload.findGlobal({ slug: 'footer', depth: 0 });
    } catch {
      return null;
    }
  },
  ['global:footer'],
  { revalidate: 60, tags: ['global:footer'] },
);
