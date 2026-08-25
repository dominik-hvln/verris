/**
 * Runner testów panelu klienta (X-40).
 *
 * Do 2026-08-25 `apps/client-panel` nie miało skryptu `test`, a bramka CI
 * odpalała wyłącznie `pnpm --filter api test`. Leżący tu od miesięcy
 * `client-nav-access.spec.ts` NIE WYKONYWAŁ SIĘ NIGDY. Wyglądał na pokrycie
 * i nim nie był — a to gorsze niż brak testu, bo brak widać.
 *
 * Skutek uboczny był poważniejszy niż jeden martwy plik: każdy strażnik
 * dotyczący panelu (X-37, X-38, X-39) musiał CZYTAĆ ŹRÓDŁO zamiast wykonywać
 * kod, bo nie było gdzie go uruchomić.
 *
 * `testRegex` obejmuje `.tsx`, choć dziś żaden spec ich nie używa — inaczej
 * pierwszy test komponentu znów wpadłby w ciszę.
 *
 * @type {import('jest').Config}
 */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts', 'tsx'],
  rootDir: '.',
  testRegex: 'src/.*\\.spec\\.tsx?$',
  transform: {
    '^.+\\.(t|j)sx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  // Alias `@/` z tsconfig panelu — bez tego każdy import `@/lib/...` w teście
  // kończy się „Cannot find module".
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  // `.next` to WYNIK builda, nie źródło. Bez tego jest skanuje
  // `.next/standalone/apps/client-panel/package.json` i zgłasza kolizję nazw
  // („Haste module naming collision"). Dziś to samo ostrzeżenie, ale pierwszy
  // test importujący moduł panelu mógłby dostać kopię ze `standalone` zamiast
  // kodu ze `src` — czyli sprawdzać poprzedni build zamiast bieżącego kodu.
  modulePathIgnorePatterns: ['<rootDir>/.next/'],
  testEnvironment: 'node',
};
