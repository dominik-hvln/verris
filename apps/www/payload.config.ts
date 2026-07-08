import path from 'path';
import { fileURLToPath } from 'url';
import { buildConfig } from 'payload';
import { postgresAdapter } from '@payloadcms/db-postgres';
import { lexicalEditor } from '@payloadcms/richtext-lexical';
import sharp from 'sharp';

import { Users } from './src/collections/Users';
import { Media } from './src/collections/Media';
import { Pages } from './src/collections/Pages';
import { Posts } from './src/collections/Posts';
import { Services } from './src/collections/Services';
import { SiteSettings } from './src/globals/SiteSettings';
import { Navigation } from './src/globals/Navigation';
import { Footer } from './src/globals/Footer';
import { Pricing } from './src/globals/Pricing';

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default buildConfig({
  admin: {
    user: Users.slug,
    meta: {
      titleSuffix: '· Verris CMS',
    },
  },
  collections: [Users, Media, Pages, Posts, Services],
  globals: [SiteSettings, Navigation, Footer, Pricing],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'src/payload-types.ts'),
  },
  // Treści po polsku (zgodnie z zasadami marki).
  localization: {
    locales: [{ label: 'Polski', code: 'pl' }],
    defaultLocale: 'pl',
  },
  db: postgresAdapter({
    pool: { connectionString: process.env.DATABASE_URI || '' },
    // Izolacja od tabel Prisma na tej samej bazie.
    schemaName: 'payload',
  }),
  sharp,
});
