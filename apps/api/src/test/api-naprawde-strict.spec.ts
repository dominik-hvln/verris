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
 * Etap 2 (2026-09-24): także `noImplicitAny` — 27 miejsc (licznik 221 był zawyżony przez
 * nierozwiązany w środowisku pomiaru moduł SDK, który zamieniał się w kaskadę `any`).
 */
const PROFIL = resolve(import.meta.dirname, '..', '..', '..', '..', 'libs', 'typescript-config', 'nestjs.json');

it('profil Nest nie wyłącza żadnego składnika trybu ścisłego', () => {
  const opcje = JSON.parse(readFileSync(PROFIL, 'utf8')).compilerOptions as Record<string, unknown>;
  for (const klucz of ['noImplicitAny', 'strictNullChecks', 'strictBindCallApply', 'strictFunctionTypes', 'strictPropertyInitialization', 'forceConsistentCasingInFileNames', 'strict']) {
    expect({ klucz, wartosc: opcje[klucz] }).not.toEqual({ klucz, wartosc: false });
  }
});
