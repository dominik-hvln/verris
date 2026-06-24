import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/** VER-UPG — loads the canonical on-node MariaDB upgrade script (CustomBuild). */
export function loadDbUpgradeScript(): string {
  const candidates = [
    join(process.cwd(), 'ops/scripts/node-db-upgrade.sh'),
    join(process.cwd(), '../../ops/scripts/node-db-upgrade.sh'),
    join(__dirname, '../../../../../ops/scripts/node-db-upgrade.sh'),
    join(__dirname, '../../../../ops/scripts/node-db-upgrade.sh'),
  ];
  for (const path of candidates) {
    if (existsSync(path)) {
      return readFileSync(path, 'utf8');
    }
  }
  throw new Error('node-db-upgrade.sh not found in monorepo');
}
