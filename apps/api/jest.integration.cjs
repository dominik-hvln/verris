/**
 * X-04 — konfiguracja testów integracyjnych.
 *
 * Osobna od jest.config.cjs celowo. Testy jednostkowe mają biec zawsze i wszędzie,
 * w milisekundach, bez żadnej infrastruktury. Te wymagają Postgresa i czyszczą
 * bazę przed każdym testem — pomieszanie ich sprawiłoby, że pakiet jednostkowy
 * przestałby być uruchamialny na czyjejkolwiek maszynie bez konfiguracji.
 *
 * `maxWorkers: 1` jest wymogiem poprawności, nie optymalizacją: testy dzielą
 * jedną bazę i zaczynają od TRUNCATE. Równoległe workery kasowałyby sobie dane
 * nawzajem, a objawiłoby się to jako losowo padające testy — najgorszy możliwy
 * rodzaj czerwieni, bo uczy zespół ignorować czerwień.
 *
 * @type {import('jest').Config}
 */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.int-spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  testEnvironment: 'node',
  maxWorkers: 1,
  testTimeout: 30_000,
};
