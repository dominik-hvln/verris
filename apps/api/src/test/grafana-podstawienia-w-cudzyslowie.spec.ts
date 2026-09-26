import { readdirSync, readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';

/**
 * Grafana podstawia $ZMIENNE w plikach provisioningu w SUROWYM tekście, zanim sparsuje YAML.
 * Wartość bez cudzysłowu dostaje więc typ od tego, co akurat siedzi w .env: chat id „0” albo
 * „-100…” staje się liczbą, hasło „123456” też, a „*abc” albo „#abc” psuje składnię.
 * 2026-09-23 (PB-11): chatid bez cudzysłowu → „cannot unmarshal number into … chatid of type
 * string” → Grafana w pętli restartów, alerty wyłączone do ręcznej poprawki na serwerze.
 */
const PROV = resolve(import.meta.dirname, '../../../../ops/observability/grafana/provisioning');

function pliki(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? pliki(p) : /\.ya?ml$/.test(n) ? [p] : [];
  });
}

describe('provisioning Grafany — podstawienia zmiennych w cudzysłowie', () => {
  const yamle = pliki(PROV);

  it('test widzi pliki provisioningu (sam się nie oszukuje)', () => {
    expect(yamle.some((p) => p.endsWith('contactpoints.yaml'))).toBe(true);
  });

  it('żadna wartość nie jest gołym $ZMIENNA / ${ZMIENNA}', () => {
    const gole = yamle.flatMap((p) =>
      readFileSync(p, 'utf8').split('\n')
        .map((l, i) => ({ l, i }))
        .filter(({ l }) => /^\s*-?\s*[\w.-]+:\s*\$\{?[A-Z_][A-Z0-9_]*\}?\s*(#.*)?$/.test(l))
        .map(({ l, i }) => `${p.split('/provisioning/')[1]}:${i + 1}  ${l.trim()}`),
    );
    expect(gole).toEqual([]);
  });
});
