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
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-empty-object-type': 'warn',
      'no-empty': ['error', { allowEmptyCatch: true }],

      // Reguły odsłonięte przez samo WŁĄCZENIE lintowania w pakietach, które
      // nigdy go nie miały. Zostają widoczne jako ostrzeżenia, żeby nie
      // blokowały podniesienia zależności, i wracają na 'error' przy X-18.
      //
      // no-control-regex jest tu wyjątkiem trwałym: znaki sterujące w regexach
      // walidacyjnych (migration-input-guard, sanityzacja nazw kont) są
      // zamierzone — to one wykrywają wstrzyknięcia.
      '@typescript-eslint/no-unsafe-function-type': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',
      'no-control-regex': 'off',
      'no-irregular-whitespace': 'warn',

      // no-useless-escape zostaje ostrzeżeniem świadomie. Cztery wystąpienia
      // siedzą w regexach WALIDUJĄCYCH WEJŚCIE (kody promocyjne, ścieżki
      // plików, nazwy załączników). Zbędny backslash jest tam niegroźny,
      // ale zmiana regexa walidacyjnego przy okazji podnoszenia zależności to
      // dokładnie ten rodzaj zmiany, który Z-03 kazał robić z testem na każdy
      // przypadek, a nie hurtem przez --fix.
      'no-useless-escape': 'warn',
    },
  },
];
