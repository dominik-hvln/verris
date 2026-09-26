// PB-38: NestJS 12 to czysty ESM; skrypty `test`/`test:int` uruchamiają Jesta z --experimental-vm-modules,
// dzięki czemu Jest ładuje go przez require(esm) (Node 24.9+, dokumentacja Jesta: ECMAScript Modules).
/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.json',
      },
    ],
  },
  collectCoverageFrom: ['src/**/*.(t|j)s', '!src/**/*.spec.ts', '!src/test/**'],
  coverageDirectory: './coverage',
  // X-22 tłumaczyło archivera (czysty ESM) na CJS. Od PB-38 Jest ładuje paczki ESM przez require(esm)
  // (--experimental-vm-modules w skrypcie `test`), więc node_modules zostają nietknięte.
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/src/test/jest-setup.ts'],
};
