import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/** Loads the canonical hosting profile bash script from the monorepo. */
export function loadHostingProfileScript(): string {
  const candidates = [
    join(process.cwd(), 'ops/scripts/node-hosting-profile.sh'),
    join(process.cwd(), '../../ops/scripts/node-hosting-profile.sh'),
    join(__dirname, '../../../../../ops/scripts/node-hosting-profile.sh'),
    join(__dirname, '../../../../ops/scripts/node-hosting-profile.sh'),
  ];
  for (const path of candidates) {
    if (existsSync(path)) {
      return readFileSync(path, 'utf8');
    }
  }
  throw new Error('node-hosting-profile.sh not found in monorepo');
}
