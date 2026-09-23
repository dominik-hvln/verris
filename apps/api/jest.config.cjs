/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    // X-22 — archiver 8 i jego zależności to czysty ESM; bez tłumaczenia na CJS żaden
    // test nie mógł dotknąć eksportu RODO (i nie dotykał — patrz X-21).
    '/node_modules/.+\\.js$': [
      'ts-jest',
      { tsconfig: { allowJs: true, module: 'commonjs', target: 'es2022', esModuleInterop: true, isolatedModules: true } },
    ],
    '^.+\\.(t|j)s$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.json',
      },
    ],
  },
  collectCoverageFrom: ['src/**/*.(t|j)s', '!src/**/*.spec.ts', '!src/test/**'],
  coverageDirectory: './coverage',
  // Tłumaczymy wyłącznie paczki ESM z łańcucha archivera; reszta node_modules bez zmian.
  transformIgnorePatterns: ['/node_modules/(?!.*/?(archiver|crc32-stream|zip-stream|compress-commons|is-stream)/)'],
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/src/test/jest-setup.ts'],
};
