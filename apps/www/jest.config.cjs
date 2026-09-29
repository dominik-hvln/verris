/**
 * Runner testów verris.pl (CL-05). Do 29.09.2026 `apps/www` nie miało skryptu `test`,
 * więc pomiar (Consent Mode, deduplikacja zdarzeń) nie miał żadnego strażnika.
 * Konfiguracja jak w panelu klienta (apps/client-panel/jest.config.cjs).
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
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  // `.next` to wynik builda — bez tego jest skanuje kopię `standalone` (kolizja nazw modułów).
  modulePathIgnorePatterns: ['<rootDir>/.next/'],
  testEnvironment: 'node',
};
