import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Komunikaty wyjątków HTTP trafiają do panelu klienta wprost (lib/api.ts pokazuje `message`).
 * D3 07.10: „Insufficient wallet balance”, „Amount must be positive”, „Service not found” po angielsku.
 * Strażnik na najczęstsze angielskie wzorce — nowe komunikaty piszemy po polsku.
 */
function pliki(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return pliki(p);
    return p.endsWith('.ts') && !p.endsWith('.spec.ts') ? [p] : [];
  });
}

describe('komunikaty wyjątków po polsku', () => {
  it('bez „X not found”, „Insufficient …”, „Amount must …” w wyjątkach HTTP', () => {
    const wzorzec = /Exception\(\s*'(?:[A-Z][a-z]+(?: [a-z]+)? not found|Insufficient [^']*|Amount must [^']*)'/;
    const winne = pliki(join(__dirname, '..'))
      .flatMap((f) => readFileSync(f, 'utf8').split('\n').map((l, i) => [f, i + 1, l] as const))
      .filter(([, , l]) => wzorzec.test(l))
      .map(([f, i, l]) => `${f.split('/src/')[1]}:${i} ${l.trim()}`);
    expect(winne).toEqual([]);
  });
});
