import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import * as archiver from 'archiver';

function resolveOpsRoot(): string {
  const candidates = [
    join(process.cwd(), 'ops'),
    join(process.cwd(), '../../ops'),
    join(__dirname, '../../../../../ops'),
    join(__dirname, '../../../../ops'),
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
    const archive = archiver.create('tar', { gzip: true });
    const chunks: Buffer[] = [];
    archive.on('data', (chunk: Buffer) => chunks.push(chunk));
    archive.on('error', reject);
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    archive.directory(srcDir, false);
    void archive.finalize();
  });
}
