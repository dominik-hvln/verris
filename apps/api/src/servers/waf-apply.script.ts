import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/** B2 — loads the canonical ModSecurity per-account apply script. */
export function loadWafApplyScript(): string {
  const candidates = [
    join(process.cwd(), 'ops/scripts/node-waf-apply.sh'),
    join(process.cwd(), '../../ops/scripts/node-waf-apply.sh'),
    join(__dirname, '../../../../../ops/scripts/node-waf-apply.sh'),
    join(__dirname, '../../../../ops/scripts/node-waf-apply.sh'),
  ];
  for (const path of candidates) {
    if (existsSync(path)) {
      return readFileSync(path, 'utf8');
    }
  }
  throw new Error('node-waf-apply.sh not found in monorepo');
}
