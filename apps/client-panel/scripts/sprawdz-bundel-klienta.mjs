#!/usr/bin/env node
/**
 * P5-01 — po `next build`: czy pliki JS wysyłane przeglądarce (`.next/static`) nie zawierają słów zaplecza.
 * Uruchom z katalogu apps/client-panel: `node scripts/sprawdz-bundel-klienta.mjs` (kod wyjścia 1 = wyciek).
 * Kod serwerowy (`.next/server`) nie jest sprawdzany — nie trafia do przeglądarki.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const { slowoZapleczaWBuildzie: slowoZaplecza } = createRequire(import.meta.url)('./slowa-zaplecza.cjs');
const katalog = join(process.cwd(), '.next', 'static');
if (!existsSync(katalog)) {
  console.error('Brak .next/static – najpierw `next build`.');
  process.exit(2);
}
const trafienia = [];
const przejdz = (dir) => {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) przejdz(p);
    else if (n.endsWith('.js')) {
      const kod = readFileSync(p, 'utf8');
      const slowo = slowoZaplecza(kod);
      if (slowo) {
        const i = kod.indexOf(slowo);
        trafienia.push(`${p.slice(katalog.length + 1)}: „${slowo}” … ${kod.slice(Math.max(0, i - 60), i + 60).replace(/\s+/g, ' ')}`);
      }
    }
  }
};
przejdz(katalog);
if (trafienia.length) {
  console.error(`Słowa zaplecza w kodzie przeglądarki (${trafienia.length}):\n${trafienia.join('\n')}`);
  process.exit(1);
}
console.log('OK – kod przeglądarki panelu klienta bez słów zaplecza.');
