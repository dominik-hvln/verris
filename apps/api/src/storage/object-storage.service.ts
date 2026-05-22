import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client as MinioClient, type ClientOptions, type ItemBucketMetadata } from 'minio';
import type { Readable } from 'stream';
import { ObjectBuckets, type ObjectBucket, type ObjectMetadata } from './object-storage.types';

interface BucketBootstrap {
  /** Logical bucket key, e.g. TICKET_ATTACHMENTS. */
  logical: ObjectBucket;
  /** Physical name in MinIO/S3, e.g. "verris-ticket-attachments". */
  name: string;
  /**
   * Object lifecycle in days. If set, MinIO will auto-expire objects older
   * than this many days. Used for `DATA_EXPORTS` (7d) so the storage
   * naturally garbage-collects even if our scheduler is offline.
   */
  expireAfterDays?: number;
}

/**
 * Single point of contact for object storage (MinIO / S3-compatible).
 *
 * MinIO runs locally in our docker-compose stack. The same code talks to
 * AWS S3, Backblaze B2, Cloudflare R2 etc. by changing `S3_ENDPOINT` and
 * `S3_REGION` env variables — that's the whole point of using an
 * S3-compatible interface here.
 *
 * Usage:
 *   await storage.putObject(ObjectBuckets.TICKET_ATTACHMENTS, key, buf, { contentType });
 *   const buf = await storage.getObjectBuffer(ObjectBuckets.TICKET_ATTACHMENTS, key);
 *   const stream = await storage.getObjectStream(ObjectBuckets.DATA_EXPORTS, key);
 *   const url = await storage.presignedGetUrl(ObjectBuckets.DATA_EXPORTS, key, 600);
 *   await storage.removeObject(ObjectBuckets.DATA_EXPORTS, key);
 *
 * On application bootstrap we ensure required buckets exist (`makeBucket`
 * is idempotent because we check `bucketExists` first) and apply lifecycle
 * rules. This means a fresh production deploy starts with a working bucket
 * layout without manual `mc mb` steps — the operator only needs to provide
 * the access keys.
 *
 * Failure modes:
 *  - At construction time: misconfigured env throws synchronously so the
 *    Nest container crashes early (catastrophic config errors are loud).
 *  - At call time: any network/auth error throws `ServiceUnavailableException`
 *    so the public API returns a clean 503 instead of a 500 stack trace.
 *  - At bootstrap: bucket creation/lifecycle setup failures are LOGGED
 *    but do NOT block startup — the panel can still serve read-only
 *    endpoints while the operator fixes MinIO.
 */
@Injectable()
export class ObjectStorageService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ObjectStorageService.name);
  private readonly client: MinioClient;
  private readonly buckets: ReadonlyMap<ObjectBucket, BucketBootstrap>;

  constructor(private readonly config: ConfigService) {
    const endpoint = this.requireEnv('S3_ENDPOINT');
    const accessKey = this.requireEnv('S3_ACCESS_KEY');
    const secretKey = this.requireEnv('S3_SECRET_KEY');
    const region = this.config.get<string>('S3_REGION') ?? 'us-east-1';
    const useSsl = this.parseBool(this.config.get<string>('S3_USE_SSL'), true);
    const portRaw = this.config.get<string>('S3_PORT');
    const port = portRaw ? Number.parseInt(portRaw, 10) : undefined;

    // The minio client expects `endPoint` without protocol/port — we sanitize
    // a `https://host:port` URL into its parts so operators can paste a full
    // URL or just a hostname interchangeably.
    const parsed = parseEndpoint(endpoint);

    const options: ClientOptions = {
      endPoint: parsed.hostname,
      accessKey,
      secretKey,
      useSSL: parsed.useSslOverride ?? useSsl,
      region,
      ...(parsed.port ?? port ? { port: (parsed.port ?? port) as number } : {}),
      // Path-style addressing is required for MinIO and works fine for AWS S3
      // when virtual-host style isn't critical (it is for very-old AWS regions
      // but not for any post-2020 region).
      pathStyle: this.parseBool(this.config.get<string>('S3_PATH_STYLE'), true),
    };

    this.client = new MinioClient(options);

    this.buckets = new Map<ObjectBucket, BucketBootstrap>([
      [
        ObjectBuckets.TICKET_ATTACHMENTS,
        {
          logical: ObjectBuckets.TICKET_ATTACHMENTS,
          name:
            this.config.get<string>('S3_BUCKET_TICKET_ATTACHMENTS') ??
            'verris-ticket-attachments',
        },
      ],
      [
        ObjectBuckets.DATA_EXPORTS,
        {
          logical: ObjectBuckets.DATA_EXPORTS,
          name: this.config.get<string>('S3_BUCKET_DATA_EXPORTS') ?? 'verris-data-exports',
          expireAfterDays: 7,
        },
      ],
      [
        ObjectBuckets.DPA_PDFS,
        {
          logical: ObjectBuckets.DPA_PDFS,
          name: this.config.get<string>('S3_BUCKET_DPA_PDFS') ?? 'verris-dpa-pdfs',
        },
      ],
      [
        ObjectBuckets.INVOICES,
        {
          logical: ObjectBuckets.INVOICES,
          name: this.config.get<string>('S3_BUCKET_INVOICES') ?? 'verris-invoices',
        },
      ],
    ]);
  }

  // ---------------------------------------------------------------------------
  // Bootstrap
  // ---------------------------------------------------------------------------

  async onApplicationBootstrap(): Promise<void> {
    for (const cfg of this.buckets.values()) {
      try {
        await this.ensureBucket(cfg);
      } catch (err) {
        this.logger.error(
          `Failed to bootstrap bucket "${cfg.name}" (logical=${cfg.logical}): ${
            (err as Error).message
          }. The panel will start anyway; uploads to this bucket will return 503 ` +
            `until the operator fixes the MinIO/S3 configuration.`,
        );
      }
    }
  }

  private async ensureBucket(cfg: BucketBootstrap): Promise<void> {
    const exists = await this.client.bucketExists(cfg.name);
    if (!exists) {
      await this.client.makeBucket(cfg.name);
      this.logger.log(`Created bucket "${cfg.name}" (logical=${cfg.logical})`);
    }
    if (cfg.expireAfterDays) {
      const lifecycle = {
        Rule: [
          {
            ID: `verris-expire-${cfg.expireAfterDays}d`,
            Status: 'Enabled',
            Expiration: { Days: cfg.expireAfterDays },
            Filter: { Prefix: '' },
          },
        ],
      };
      try {
        await this.client.setBucketLifecycle(cfg.name, lifecycle);
      } catch (err) {
        // Some self-hosted MinIO setups disable lifecycle; we log but don't
        // fail (our app-level RetentionScheduler is the source of truth).
        this.logger.warn(
          `Lifecycle policy not applied to "${cfg.name}": ${(err as Error).message}. ` +
            `App-level RetentionScheduler will continue cleaning up.`,
        );
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Public API — bucket name resolution
  // ---------------------------------------------------------------------------

  resolveBucket(logical: ObjectBucket): string {
    const cfg = this.buckets.get(logical);
    if (!cfg) {
      throw new Error(`Unknown logical bucket: ${logical}`);
    }
    return cfg.name;
  }

  // ---------------------------------------------------------------------------
  // Read
  // ---------------------------------------------------------------------------

  async getObjectBuffer(logical: ObjectBucket, key: string): Promise<Buffer> {
    return this.wrap(`getObjectBuffer(${logical}, ${key})`, async () => {
      const bucket = this.resolveBucket(logical);
      const stream = await this.client.getObject(bucket, key);
      return await streamToBuffer(stream);
    });
  }

  async getObjectStream(logical: ObjectBucket, key: string): Promise<Readable> {
    return this.wrap(`getObjectStream(${logical}, ${key})`, async () => {
      const bucket = this.resolveBucket(logical);
      return this.client.getObject(bucket, key);
    });
  }

  /**
   * Ostatni dump Postgres w MinIO (`postgres/latest.sql.gz`) — metryki Grafana / alerty.
   */
  async getPostgresBackupLatestStat(): Promise<{
    ageSeconds: number;
    sizeBytes: number;
    lastModifiedUnix: number;
  } | null> {
    const bucket =
      this.config.get<string>('S3_BUCKET_BACKUPS') ?? 'verris-backups';
    const key = 'postgres/latest.sql.gz';
    try {
      const stat = await this.client.statObject(bucket, key);
      const lastModified = stat.lastModified ?? new Date(0);
      const ageSeconds = Math.max(
        0,
        Math.floor((Date.now() - lastModified.getTime()) / 1000),
      );
      return {
        ageSeconds,
        sizeBytes: stat.size,
        lastModifiedUnix: Math.floor(lastModified.getTime() / 1000),
      };
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'NotFound' || code === 'NoSuchKey') return null;
      this.logger.warn(
        `Postgres backup stat failed: ${(err as Error).message}`,
      );
      return null;
    }
  }

  async objectExists(logical: ObjectBucket, key: string): Promise<boolean> {
    try {
      const bucket = this.resolveBucket(logical);
      await this.client.statObject(bucket, key);
      return true;
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'NotFound' || code === 'NoSuchKey') return false;
      throw err;
    }
  }

  /**
   * Generates a time-limited presigned GET URL. Useful when we want the
   * client to download directly from MinIO/S3 without proxying through the
   * API (saves bandwidth + RAM for large data exports). The URL contains a
   * signature so the bucket can stay private.
   *
   * NOTE: requires that `S3_ENDPOINT` is reachable from the user's browser.
   * If MinIO is internal-only (default in our docker-compose), prefer
   * `getObjectStream` and pipe through the API instead.
   */
  async presignedGetUrl(
    logical: ObjectBucket,
    key: string,
    expiresInSec: number,
    contentDisposition?: string,
  ): Promise<string> {
    return this.wrap(`presignedGetUrl(${logical}, ${key})`, async () => {
      const bucket = this.resolveBucket(logical);
      const respHeaders = contentDisposition
        ? { 'response-content-disposition': contentDisposition }
        : undefined;
      return this.client.presignedGetObject(bucket, key, expiresInSec, respHeaders);
    });
  }

  // ---------------------------------------------------------------------------
  // Write
  // ---------------------------------------------------------------------------

  async putObject(
    logical: ObjectBucket,
    key: string,
    body: Buffer | Readable,
    meta: ObjectMetadata = {},
  ): Promise<void> {
    await this.wrap(`putObject(${logical}, ${key})`, async () => {
      const bucket = this.resolveBucket(logical);
      const headers = buildMetaHeaders(meta);
      if (Buffer.isBuffer(body)) {
        await this.client.putObject(bucket, key, body, body.length, headers);
      } else {
        // Streaming upload — multipart auto-handled by minio-js when size omitted.
        await this.client.putObject(bucket, key, body, undefined, headers);
      }
    });
  }

  /**
   * Uploads from a local file. Strongly preferred over `putObject(stream)`
   * for big artifacts (data exports) because:
   *   - We can fsync the archive to disk and verify size before uploading.
   *   - On error mid-upload, the temp file is still on disk for diagnosis.
   *   - minio-js uses native fs streaming + multipart under the hood.
   */
  async putFile(
    logical: ObjectBucket,
    key: string,
    filePath: string,
    meta: ObjectMetadata = {},
  ): Promise<void> {
    await this.wrap(`putFile(${logical}, ${key}, ${filePath})`, async () => {
      const bucket = this.resolveBucket(logical);
      const headers = buildMetaHeaders(meta);
      await this.client.fPutObject(bucket, key, filePath, headers);
    });
  }

  // ---------------------------------------------------------------------------
  // Delete
  // ---------------------------------------------------------------------------

  async removeObject(logical: ObjectBucket, key: string): Promise<void> {
    await this.wrap(`removeObject(${logical}, ${key})`, async () => {
      const bucket = this.resolveBucket(logical);
      await this.client.removeObject(bucket, key);
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async wrap<T>(label: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      const msg = (err as Error).message ?? String(err);
      this.logger.error(`Object storage error: ${label}: ${msg}`);
      throw new ServiceUnavailableException('Storage backend is unavailable. Try again later.');
    }
  }

  private requireEnv(name: string): string {
    const v = this.config.get<string>(name);
    if (!v || !v.trim()) {
      throw new Error(
        `Missing required env var ${name}. Object storage cannot start without it.`,
      );
    }
    return v.trim();
  }

  private parseBool(value: string | undefined, defaultValue: boolean): boolean {
    if (value === undefined) return defaultValue;
    const v = value.trim().toLowerCase();
    if (v === 'true' || v === '1' || v === 'yes') return true;
    if (v === 'false' || v === '0' || v === 'no') return false;
    return defaultValue;
  }
}

// ----------------------------------------------------------------------------
// Module-private helpers
// ----------------------------------------------------------------------------

function streamToBuffer(stream: Readable): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    stream.once('end', () => resolve(Buffer.concat(chunks)));
    stream.once('error', reject);
  });
}

function parseEndpoint(raw: string): { hostname: string; port?: number; useSslOverride?: boolean } {
  // Accept either "host", "host:port", "https://host", or "https://host:port".
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    try {
      const url = new URL(raw);
      return {
        hostname: url.hostname,
        port: url.port ? Number.parseInt(url.port, 10) : undefined,
        useSslOverride: url.protocol === 'https:',
      };
    } catch {
      // fall through
    }
  }
  if (raw.includes(':')) {
    const [host, p] = raw.split(':');
    const port = Number.parseInt(p, 10);
    return Number.isFinite(port) ? { hostname: host, port } : { hostname: raw };
  }
  return { hostname: raw };
}

function buildMetaHeaders(meta: ObjectMetadata): ItemBucketMetadata {
  const headers: ItemBucketMetadata = {};
  if (meta.contentType) {
    headers['Content-Type'] = meta.contentType;
  }
  if (meta.originalFilename) {
    // RFC 5987 — encode unicode filename for `Content-Disposition` later.
    const safe = meta.originalFilename.replace(/[\r\n"]/g, '_');
    headers['x-amz-meta-original-filename'] = safe;
  }
  if (meta.custom) {
    for (const [k, v] of Object.entries(meta.custom)) {
      const key = `x-amz-meta-${k.toLowerCase()}`;
      headers[key] = String(v).slice(0, 2048);
    }
  }
  return headers;
}
