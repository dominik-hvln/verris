import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * CL-02 — white label w mailach do klienta: treść szablonów (bez komentarzy) nie zawiera nazwy panelu
 * serwera, jego komend ani portu 2222. Komentarze i identyfikatory w kodzie zostają.
 */
it('żaden szablon maila nie pokazuje klientowi nazwy panelu serwera', () => {
  const trafienia: string[] = [];
  const przejdz = (dir: string) => {
    for (const n of readdirSync(dir)) {
      const p = join(dir, n);
      if (statSync(p).isDirectory()) przejdz(p);
      else if (n.endsWith('.ts') && !n.endsWith('.spec.ts')) {
        const kod = readFileSync(p, 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/(^|[^:\\'"`])\/\/.*$/gm, '$1');
        if (/DirectAdmin|CustomBuild|CMD_API|\b2222\b/i.test(kod) || /\bDA\b/.test(kod)) trafienia.push(n);
      }
    }
  };
  przejdz(__dirname);
  expect(trafienia).toEqual([]);
});
