import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * X-27 — obraz, który trafia na serwer, musi się budować przed scaleniem.
 *
 * Deploy #63 wywalił się na budowaniu obrazu `verris-api` — już PO scaleniu do
 * `main`, bo jedynym miejscem, w którym ten obraz w ogóle powstawał, był
 * workflow wdrożeniowy. Bramka scalenia sprawdzała lint, typy, testy, migracje
 * i asercje bazy; nie sprawdzała rzeczy, która jako jedyna trafia na serwer.
 *
 * MECHANIZM BŁĘDU. `COPY libs libs` w etapie budowania kładzie katalogi
 * pakietów na te, które zostawił etap `deps` — i pakiet traci WŁASNE
 * node_modules. Dopóki każda zależność lądowała w node_modules katalogu
 * głównego (linker `hoisted`), nie było tego widać.
 *
 * Przestało być prawdą przy `X-18`: `apps/www` podniosło Payloada, jego adapter
 * postgresowy ciągnie `drizzle-orm`, a to ma `@prisma/client` jako peer
 * OPCJONALNY. pnpm dociąga takie peery samo (`autoInstallPeers`), więc
 * w drzewie stanęły dwie wersje: 7.9.1 na górze i nasza 6.19.3 w libs/database.
 * Po `COPY` zostawała tylko ta z góry, a `prisma generate` z CLI 6.19.3 nie
 * umie pracować z klientem 7.x.
 *
 * DWIE POPRAWKI, BO TO DWA RÓŻNE BŁĘDY. `pnpm.overrides` sprowadza drzewo
 * z powrotem do jednej wersji klienta — to naprawia TEN przypadek. Ponowna
 * instalacja w obrazach naprawia coś ogólniejszego: założenie, że każda
 * zależność hoistuje się do korzenia. Trzymało się przypadkiem, do pierwszego
 * pakietu występującego w dwóch wersjach.
 *
 * Po drodze dwa razy uwierzyłem w wynik, który niczego nie dowodził: raz pnpm
 * nie przeliczył lockfile'a i override wyglądał na nieskuteczny, raz uproszczone
 * repozytorium nie zawierało apps/www, czyli pakietu ciągnącego 7.9.1 — i wynik
 * wyglądał na dobry z niewłaściwego powodu. Rozstrzygnięte dopiero na pełnym
 * drzewie zależności.
 */

const KORZEN = join(__dirname, '..', '..', '..', '..');

/** Treść bez komentarzy — po raz ósmy ta sama lekcja w tym projekcie. */
function kod(sciezka: string): string {
  return readFileSync(join(KORZEN, sciezka), 'utf8')
    .split('\n')
    .filter((l) => !/^\s*#/.test(l))
    .join('\n');
}

const DOCKERFILE = ['Dockerfile.api', 'Dockerfile.panel'] as const;

describe.each(DOCKERFILE)('%s odtwarza node_modules po skopiowaniu źródeł', (plik) => {
  const tresc = kod(plik);

  it('strażnik czyta właściwy plik', () => {
    expect(tresc).toContain('FROM deps AS build');
    expect(tresc).toContain('COPY libs libs');
  });

  it('instaluje ponownie PO `COPY libs libs`, nie przed', () => {
    // Instalacja przed skopiowaniem źródeł to dokładnie stan sprzed X-27:
    // etap `deps` układa node_modules, a `COPY` je rozgania.
    const copy = tresc.indexOf('COPY libs libs');
    const install = tresc.indexOf('pnpm install', copy);
    expect(copy).toBeGreaterThan(-1);
    expect(install).toBeGreaterThan(copy);
  });

  it('ponowna instalacja trzyma się lockfile', () => {
    // Bez --frozen-lockfile obraz mógłby wjechać na produkcję z innym drzewem
    // zależności niż to, które przeszło testy.
    const ogon = tresc.slice(tresc.indexOf('COPY libs libs'));
    expect(ogon).toMatch(/pnpm install[^\n]*--frozen-lockfile/);
  });

  it('budowanie idzie PO ponownej instalacji', () => {
    const install = tresc.indexOf('pnpm install', tresc.indexOf('COPY libs libs'));
    const build = tresc.indexOf('build', install);
    expect(build).toBeGreaterThan(install);
  });
});

describe('CI buduje obraz API', () => {
  const tresc = kod('.github/workflows/ci.yml');

  it('strażnik czyta właściwy plik', () => {
    expect(tresc).toContain('jobs:');
    expect(tresc).toContain('prisma migrate deploy');
  });

  it('jest job budujący Dockerfile.api', () => {
    // To jest cała pointa X-27: obraz, który trafia na serwer, buduje się
    // PRZED scaleniem, a nie dopiero przy wdrożeniu.
    expect(tresc).toContain('file: Dockerfile.api');
    expect(tresc).toContain('docker/build-push-action');
  });

  it('buduje BEZ pushowania — CI nie wypycha obrazów', () => {
    const od = tresc.indexOf('file: Dockerfile.api');
    const fragment = tresc.slice(Math.max(0, od - 400), od + 400);
    expect(fragment).toContain('push: false');
  });

  it('krok nie jest rozbrojony przez continue-on-error', () => {
    // X-23: job bezpieczeństwa meldował znaleziska i niczego nie zatrzymywał.
    const od = tresc.indexOf('obraz-api:');
    expect(od).toBeGreaterThan(-1);
    expect(tresc.slice(od)).not.toContain('continue-on-error');
  });
});

describe('drzewo zależności ma jeden klient Prismy dla naszej bazy', () => {
  const lock = readFileSync(join(KORZEN, 'pnpm-lock.yaml'), 'utf8');
  const bazaPkg = JSON.parse(
    readFileSync(join(KORZEN, 'libs', 'database', 'package.json'), 'utf8'),
  ) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };

  const major = (zakres: string) => zakres.replace(/^[^\d]*/, '').split('.')[0];

  it('CLI Prismy i klient są z tej samej wersji głównej', () => {
    // `prisma generate` z CLI 6.x nie umie pracować z klientem 7.x — i to jest
    // dokładnie ta różnica, która zatrzymała deploy #63.
    expect(major(bazaPkg.dependencies['@prisma/client'])).toBe(
      major(bazaPkg.devDependencies.prisma),
    );
  });

  it('w całym drzewie jest DOKŁADNIE JEDNA wersja @prisma/client', () => {
    // To jest bezpośrednia przyczyna deployu #63. Po X-18 drizzle-orm
    // (opcjonalny peer, dociągany przez autoInstallPeers) wstawił do drzewa
    // 7.9.1 obok naszej 6.19.3. W układzie `hoisted`, którego używają obrazy,
    // na górze stanęła 7.9.1, a nasza zjechała do libs/database — i tam jej
    // nie było po `COPY libs libs`.
    //
    // Domyka to `pnpm.overrides` w package.json. Overrides DZIAŁAJĄ na peerach
    // dociąganych automatycznie, wbrew temu, co wyszło w pierwszej próbie:
    // tamten test niczego nie dowodził, bo pnpm nie przeliczył lockfile'a,
    // a druga próba oszukała mnie inaczej — brakowało w niej package.json
    // apps/www, więc pakiet ciągnący 7.9.1 w ogóle nie wchodził do rozwiązania.
    // Sprawdzone dopiero na pełnym repozytorium.
    const wersje = [...lock.matchAll(/'@prisma\/client@([0-9.]+)'/g)].map((m) => m[1]);
    expect([...new Set(wersje)]).toEqual([
      bazaPkg.dependencies['@prisma/client'].replace(/^\^|~/, ''),
    ]);
  });
});
