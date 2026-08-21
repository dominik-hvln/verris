import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';

/**
 * Strażnik klasy błędu „skrypt jest w repo, ale nie ma go w obrazie".
 *
 * API serwuje agentowi węzła skrypty przez `/agent/tasks/*​/script`. Loadery
 * (`apps/api/src/servers/*.script.ts`) czytają je z dysku i **rzucają wyjątkiem**,
 * gdy pliku nie ma:
 *
 *     throw new Error('node-php-apply.sh not found in monorepo');
 *
 * Lokalnie plik zawsze jest — monorepo leży obok. W obrazie produkcyjnym jest
 * tylko to, co wymienia `Dockerfile.api`. Przy pierwszym przeglądzie tej listy
 * (2026-08-21) brakowało trzech skryptów: `node-account-restore.sh`,
 * `node-app-install.sh` i `node-php-apply.sh`. Odpowiadające im endpointy
 * zwracały 500 na produkcji, a zadania agenta po prostu się nie wykonywały —
 * przy zielonych testach i zielonym buildzie.
 *
 * Test jest statyczny: wyciąga ścieżki z loaderów i porównuje z listą COPY
 * w Dockerfile. Nie buduje obrazu, więc kosztuje milisekundy.
 */

const KORZEN = resolve(__dirname, '../../../..');
const API_SRC = resolve(__dirname, '..');
const DOCKERFILE = resolve(KORZEN, 'Dockerfile.api');

function plikiTs(katalog: string): string[] {
  let out: string[] = [];
  for (const w of readdirSync(katalog)) {
    const p = join(katalog, w);
    if (statSync(p).isDirectory()) {
      if (w === 'node_modules') continue;
      out = out.concat(plikiTs(p));
    } else if (w.endsWith('.ts') && !w.endsWith('.spec.ts')) {
      out.push(p);
    }
  }
  return out;
}

/**
 * Skrypty, które API faktycznie CZYTA z dysku. Rozpoznajemy po sąsiedztwie
 * `join(` — sama wzmianka w komentarzu albo w treści logu nie wymaga obecności
 * pliku w obrazie.
 */
function skryptyCzytaneZDysku(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const plik of plikiTs(API_SRC)) {
    const tresc = readFileSync(plik, 'utf8');
    const re = /join\([^)]*['"`](?:\.\.\/)*ops\/scripts\/([a-z0-9._-]+\.sh)['"`]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(tresc))) {
      const nazwa = m[1];
      const gdzie = out.get(nazwa) ?? [];
      const krotki = plik.split('/apps/')[1] ?? plik;
      if (!gdzie.includes(krotki)) gdzie.push(krotki);
      out.set(nazwa, gdzie);
    }
  }
  return out;
}

function skryptyWObrazie(): Set<string> {
  const tresc = readFileSync(DOCKERFILE, 'utf8');
  const out = new Set<string>();
  const re = /^COPY\s+ops\/scripts\/([a-z0-9._-]+\.sh)\s/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tresc))) out.add(m[1]);
  return out;
}

describe('Skrypty węzła serwowane przez API są obecne w obrazie', () => {
  const czytane = skryptyCzytaneZDysku();
  const w_obrazie = skryptyWObrazie();

  it('test sam się nie oszukuje — znajduje loadery i wpisy COPY', () => {
    expect(czytane.size).toBeGreaterThanOrEqual(3);
    expect(w_obrazie.size).toBeGreaterThanOrEqual(3);
  });

  it('każdy skrypt czytany przez API jest kopiowany do obrazu', () => {
    const brakujace = [...czytane.entries()]
      .filter(([nazwa]) => !w_obrazie.has(nazwa))
      .map(([nazwa, gdzie]) => `${nazwa}   ← czytany w ${gdzie.join(', ')}`);
    expect(brakujace.sort()).toEqual([]);
  });

  it('każdy skrypt kopiowany do obrazu istnieje w repozytorium', () => {
    const nieistniejace = [...w_obrazie].filter(
      (nazwa) => !existsSync(resolve(KORZEN, 'ops/scripts', nazwa)),
    );
    expect(nieistniejace.sort()).toEqual([]);
  });
});
