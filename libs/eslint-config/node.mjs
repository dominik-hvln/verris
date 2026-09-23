// Płaska konfiguracja ESLinta dla pakietów node'owych (api, directadmin-sdk).
//
// Do 2026-08-22 te pakiety wołały `eslint` bez ŻADNEJ konfiguracji w repozytorium:
// jedyny plik, `base.js`, jest w starym formacie eslintrc i nic go nie importuje.
// ESLint 9 wymaga płaskiej konfiguracji i bez niej kończy się błędem
// „couldn't find an eslint.config file" — czyli krok lintowania nie sprawdzał
// niczego, tylko się wywracał albo przechodził przypadkiem.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', '**/*.js'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        AbortController: 'readonly',
      },
    },
    rules: {
      // X-19 (2026-09-24): wszystkie reguły jako błędy. Dług z włączenia lintowania
      // (69 ostrzeżeń w API) spłacony — `any` zastąpione typami modeli Prismy,
      // `Function` konkretnymi sygnaturami, zbędne `\` w regexach usunięte ze
      // sprawdzeniem równoważności. Ostrzeżenie, którego nikt nie czyta, niczego
      // nie pilnuje — dlatego nie wracamy do 'warn'.
      '@typescript-eslint/no-explicit-any': 'error',
      // `_` na początku = świadomie nieużywane; rodzeństwo `...rest` służy do
      // wycinania pól (np. hash hasła) z obiektu, więc też nie jest „nieużywane”.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', ignoreRestSiblings: true }],
      '@typescript-eslint/no-empty-object-type': 'error',
      '@typescript-eslint/no-unsafe-function-type': 'error',
      '@typescript-eslint/no-require-imports': 'error',
      'no-useless-escape': 'error',
      'no-empty': ['error', { allowEmptyCatch: true }],
      // Znaki sterujące w regexach walidacyjnych (migration-input-guard, sanityzacja
      // nazw kont) są zamierzone — to one wykrywają wstrzyknięcia. Wyjątek trwały.
      'no-control-regex': 'off',
      // Spacje zerowej szerokości w komentarzach łamią `*/` w ścieżkach typu
      // `/agent/tasks/*/script` wewnątrz JSDoc; w regexach testów to celowe znaki.
      'no-irregular-whitespace': ['error', { skipComments: true, skipRegExps: true }],
    },
  },
];
