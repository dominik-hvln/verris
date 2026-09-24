/**
 * Runner testów panelu (X-05) — ten sam układ co w panelu klienta (X-40): spec bez runnera
 * wygląda na pokrycie i nim nie jest. Bramka woła `pnpm test` (Turbo), więc skrypt `test`
 * w package.json wystarcza, żeby te testy biegły w CI i lokalnie.
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
  modulePathIgnorePatterns: ['<rootDir>/.next/'],
  testEnvironment: 'node',
};
