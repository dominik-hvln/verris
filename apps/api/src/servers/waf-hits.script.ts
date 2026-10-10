import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/** F3.2 — trafienia reguł WAF (ModSecurity) dla domen konta, tylko odczyt (zadanie WAF_HITS, env WH_*). */
export function loadWafHitsScript(): string {
  const candidates = [
    join(process.cwd(), 'ops/scripts/node-waf-hits.sh'),
    join(process.cwd(), '../../ops/scripts/node-waf-hits.sh'),
    join(import.meta.dirname, '../../../../../ops/scripts/node-waf-hits.sh'),
    join(import.meta.dirname, '../../../../ops/scripts/node-waf-hits.sh'),
  ];
  for (const path of candidates) {
    if (existsSync(path)) return readFileSync(path, 'utf8');
  }
  throw new Error('node-waf-hits.sh not found in monorepo');
}
