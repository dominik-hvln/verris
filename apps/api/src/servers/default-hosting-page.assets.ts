import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import * as archiver from 'archiver';

function resolveOpsRoot(): string {
  const candidates = [
    join(process.cwd(), 'ops'),
    join(process.cwd(), '../../ops'),
    join(import.meta.dirname, '../../../../../ops'),
    join(import.meta.dirname, '../../../../ops'),
  ];
  for (const path of candidates) {
    if (existsSync(join(path, 'hosting-default-page/index.html'))) {
      return path;
    }
  }
  throw new Error('ops/hosting-default-page not found in monorepo');
}

/** Loads install-verris-default-page.sh from the monorepo. */
export function loadDefaultHostingPageInstallScript(): string {
  const opsRoot = resolveOpsRoot();
  const path = join(opsRoot, 'scripts/install-verris-default-page.sh');
  if (!existsSync(path)) {
    throw new Error('install-verris-default-page.sh not found in monorepo');
  }
  return readFileSync(path, 'utf8');
}

/** Tar.gz of ops/hosting-default-page (index.html + assets) for on-node extraction. */
export function buildDefaultHostingPageBundle(): Promise<Buffer> {
  const srcDir = join(resolveOpsRoot(), 'hosting-default-page');
  return new Promise((resolve, reject) => {
    // Patrz data-export.service.ts — archiver 8 usunął `create()`.
    const archive = new archiver.TarArchive({ gzip: true });
    const chunks: Buffer[] = [];
    archive.on('data', (chunk: Buffer) => chunks.push(chunk));
    archive.on('error', reject);
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    archive.directory(srcDir, false);
    void archive.finalize();
  });
}

/** Marka webmaila (plugin Roundcube verris_marka: CSS, logo, czcionki, watermark) — profil węzła kładzie go w custom/roundcube/plugins. */
export function buildWebmailBrandBundle(srcDir = join(resolveOpsRoot(), 'roundcube/verris_marka')): Promise<Buffer> {
  // archiver z brakującego katalogu robi pusty tar.gz z kodem 200 — węzeł brał go za markę (t1, 06.10).
  if (!existsSync(join(srcDir, 'verris_marka.php'))) {
    return Promise.reject(new Error(`ops/roundcube/verris_marka not found (${srcDir})`));
  }
  return new Promise((resolve, reject) => {
    const archive = new archiver.TarArchive({ gzip: true });
    const chunks: Buffer[] = [];
    archive.on('data', (chunk: Buffer) => chunks.push(chunk));
    archive.on('error', reject);
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    archive.directory(srcDir, false);
    void archive.finalize();
  });
}
