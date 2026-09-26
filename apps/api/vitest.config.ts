import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// PB-39: API jako ESM — testy na Vitest (zalecenie NestJS 12 dla projektów ESM, docs.nestjs.com/recipes/swc).
// SWC kompiluje dekoratory z metadanymi (emitDecoratorMetadata), których esbuild z Vite nie obsługuje.
export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    setupFiles: ['./src/test/vitest-setup.ts'],
    environment: 'node',
    // Każdy plik ładuje moduły od zera (izolacja); strażniki importujące wszystkie kontrolery
    // potrzebują pod obciążeniem więcej niż domyślne 5 s.
    testTimeout: 20_000,
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
