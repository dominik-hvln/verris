import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * X-04 — testy integracyjne (prawdziwy Postgres), osobno od jednostkowych: te wymagają bazy
 * i czyszczą ją przed każdym testem.
 *
 * `fileParallelism: false` jest wymogiem poprawności, nie optymalizacją: testy dzielą jedną bazę
 * i zaczynają od TRUNCATE — równoległe pliki kasowałyby sobie dane nawzajem.
 */
export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.int-spec.ts'],
    setupFiles: ['./src/test/vitest-setup.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 30_000,
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
