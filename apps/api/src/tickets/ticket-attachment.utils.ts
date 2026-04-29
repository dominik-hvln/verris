import { BadRequestException } from '@nestjs/common';
import { mkdir, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { randomUUID } from 'crypto';

/** Pojedynczy plik wg limitu (8 MB); do 5 plików na jeden request multipart. */
export const TICKET_UPLOAD_MAX_BYTES = 8 * 1024 * 1024;

export const TICKET_UPLOAD_MAX_FILES_PER_BATCH = 5;

/** Razem przy jednym tickecie — ochrona przed spamem. */
export const TICKET_MAX_ATTACHMENTS_PER_TICKET = 40;

const MIME_ALLOWLIST = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/x-zip-compressed',
]);

export function assertAllowedMime(mime: string): void {
  const m = (mime ?? '').trim().toLowerCase();
  if (!m || !MIME_ALLOWLIST.has(m)) {
    throw new BadRequestException(
      `Niedozwolony typ pliku (${mime}). Dozwolone: PDF, obrazy JPG/PNG/GIF/WebP, tekst (txt/csv), ZIP.`,
    );
  }
}

/** Usuń ścieżki katalogowe i znaki nietypowe. */
export function sanitizeOriginalFilename(name: string): string {
  const base = (name ?? 'attachment').replace(/\\/g, '/').split('/').pop() ?? 'attachment';
  return base.replace(/[^\w.\-+()\[\] ]+/g, '_').slice(0, 180);
}

export async function writeAttachmentFile(
  uploadRoot: string,
  storageKey: string,
  buf: Buffer,
): Promise<void> {
  const full = join(uploadRoot, storageKey);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, buf);
}

export function makeStorageKey(ticketId: string, originalName: string): string {
  const safe = sanitizeOriginalFilename(originalName);
  return `${ticketId}/${randomUUID()}_${safe}`;
}
