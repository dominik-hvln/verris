import path from 'path';
import { fileURLToPath } from 'url';
import { buildConfig } from 'payload';
import { postgresAdapter } from '@payloadcms/db-postgres';
import { lexicalEditor } from '@payloadcms/richtext-lexical';
import { s3Storage } from '@payloadcms/storage-s3';
// UWAGA: `sharp` celowo NIE jest importowany. W obrazie standalone (Next output
// tracing) natywne binaria sharp nie trafiają do runtime → Payload rzucał 500.
// Uploady działają bez sharp; auto-skalowanie miniatur jest wyłączone. Aby je
// włączyć, trzeba dołożyć binaria sharp do obrazu (osobny krok w Dockerfile).

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
    // Preferuj osobne zmienne PG* (hasło z base64/znakami specjalnymi nie wymaga
    // enkodowania URL); DATABASE_URI zostaje jako fallback dla lokalnego dev.
    pool: process.env.PGPASSWORD
      ? {
          host: process.env.PGHOST || 'postgres',
          port: Number(process.env.PGPORT || '5432'),
          user: process.env.PGUSER,
          password: process.env.PGPASSWORD,
          database: process.env.PGDATABASE,
        }
      : { connectionString: process.env.DATABASE_URI || '' },
    // Izolacja od tabel Prisma na tej samej bazie.
    schemaName: 'payload',
  }),
  // Media na MinIO (S3) — trwałe między deployami. Plugin jest obecny ZAWSZE (nie
  // warunkowo od env), inaczej `generate:importmap` w buildzie pomijał komponent
  // S3ClientUploadHandler, a runtime go potrzebował → biały ekran /admin. Faktyczne
  // działanie zależy od obecności kluczy S3 (endpoint domyślnie minio:9000). Pliki
  // serwowane przez route Payloada (/api/media/file/...), więc bucket zostaje prywatny.
  plugins: [
    s3Storage({
      collections: { media: true },
      bucket: process.env.S3_BUCKET_WWW_MEDIA || 'verris-www-media',
      config: {
        endpoint: process.env.S3_ENDPOINT || 'http://minio:9000',
        forcePathStyle: true,
        region: process.env.S3_REGION || 'us-east-1',
        credentials: {
          accessKeyId: process.env.S3_ACCESS_KEY || '',
          secretAccessKey: process.env.S3_SECRET_KEY || '',
        },
      },
    }),
  ],
});
