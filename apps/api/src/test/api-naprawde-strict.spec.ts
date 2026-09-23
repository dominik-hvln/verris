import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * X-48 — `strict: true` w API nie jest dekoracją.
 *
 * Profil `nestjs.json` dziedziczył `strict: true` z `base.json` i zaraz potem gasił
 * jego najważniejsze składniki. Po włączeniu `strictNullChecks` wyszły m.in. dwa
 * zapytania Prismy, które walidacja zapytania odrzuca w czasie działania
 * (`not: null` na polu NOT NULL i na polu Json). Ten strażnik pilnuje, żeby nikt
 * nie wyłączył tego z powrotem jedną linijką.
 *
 * `noImplicitAny` jest wciąż wyłączone świadomie — osobny etap X-48 (ok. 220 miejsc).
 */
const PROFIL = resolve(__dirname, '..', '..', '..', '..', 'libs', 'typescript-config', 'nestjs.json');

it('profil Nest nie wyłącza składników trybu ścisłego (poza noImplicitAny, etap 2)', () => {
  const opcje = JSON.parse(readFileSync(PROFIL, 'utf8')).compilerOptions as Record<string, unknown>;
  for (const klucz of ['strictNullChecks', 'strictBindCallApply', 'strictFunctionTypes', 'strictPropertyInitialization', 'forceConsistentCasingInFileNames', 'strict']) {
    expect({ klucz, wartosc: opcje[klucz] }).not.toEqual({ klucz, wartosc: false });
  }
});
