import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/** C-25/C-26 — repozytorium Git strony (zadanie GIT_DEPLOY, env GD_*). */
export function loadGitDeployScript(): string {
  const candidates = [
    join(process.cwd(), 'ops/scripts/node-git-deploy.sh'),
    join(process.cwd(), '../../ops/scripts/node-git-deploy.sh'),
    join(__dirname, '../../../../../ops/scripts/node-git-deploy.sh'),
    join(__dirname, '../../../../ops/scripts/node-git-deploy.sh'),
  ];
  for (const path of candidates) {
    if (existsSync(path)) return readFileSync(path, 'utf8');
  }
  throw new Error('node-git-deploy.sh not found in monorepo');
}
