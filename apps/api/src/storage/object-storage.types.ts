/**
 * Logical bucket identifiers used across the panel.
 *
 * The mapping `LogicalBucket → MinIO bucket name` lives in
 * `ObjectStorageService.resolveBucket()` and is driven by env (`S3_BUCKET_*`).
 * Code should never hardcode a literal string like `'verris-tickets'` —
 * always reference the enum so that admins can re-map buckets without a
 * rebuild.
 */
export const ObjectBuckets = {
  TICKET_ATTACHMENTS: 'TICKET_ATTACHMENTS',
  DATA_EXPORTS: 'DATA_EXPORTS',
  DPA_PDFS: 'DPA_PDFS',
  INVOICES: 'INVOICES',
} as const;

export type ObjectBucket = (typeof ObjectBuckets)[keyof typeof ObjectBuckets];

export interface ObjectMetadata {
  /** MIME type stored on the object (`Content-Type`). */
  contentType?: string;
  /** Original filename, returned via `Content-Disposition` on download. */
  originalFilename?: string;
  /** Free-form `x-amz-meta-*` headers (alphanumeric only, lowercase keys). */
  custom?: Record<string, string>;
}
