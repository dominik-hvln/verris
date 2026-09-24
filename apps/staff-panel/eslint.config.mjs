// Next 16 usunęło komendę `next lint`, więc konfiguracja przechodzi na płaski
// format ESLinta, a skrypt `lint` woła eslint wprost. Bez tego `next lint`
// jest interpretowane jako `next <katalog>` i kończy się komunikatem
// „Invalid project directory provided, no such directory: .../lint".
//
// Nowszy eslint-config-next włącza reguły, których poprzednia konfiguracja nie
// egzekwowała — przede wszystkim rodzinę react-hooks z React Compilera.
// W panelu klienta odsłoniło to 105 znalezisk. Nie są ukryte: reguły zostają
// włączone, ale jako OSTRZEŻENIA, żeby były widoczne w wyjściu lintera i żeby
// jednocześnie nie blokowały CI zmianą, która jest podniesieniem zależności,
// a nie sprzątaniem kodu.
//
// Sprzątanie jest zapisane w macierzy jako X-18. Przy jego zamykaniu te wpisy
// wracają na 'error' — lista poniżej jest jego zakresem, nie trwałym ustępstwem.
//
// X-19 (2026-09-24): dług spłacony, reguły jako błędy.
const ODSLONIETE_PRZEZ_NEXT_16 = {
  'react-hooks/set-state-in-effect': 'error',
  'react-hooks/purity': 'error',
  'react-hooks/immutability': 'error',
  'react-hooks/refs': 'error',
  'react/no-unescaped-entities': 'error',
  '@next/next/no-html-link-for-pages': 'error',
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/ban-ts-comment': 'error',
};

import coreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
import jsxA11y from 'eslint-plugin-jsx-a11y';

const config = [
  { ignores: ['.next/**', 'node_modules/**', 'dist/**', 'out/**', 'next-env.d.ts'] },
  ...coreWebVitals,
  ...nextTypescript,
  // X-42: reguły react-hooks tylko w zasięgu, w którym eslint-config-next rejestruje wtyczkę
  // (bez .cjs — inaczej jest.config.cjs wywraca lintera: „could not find plugin react-hooks”).
  { files: ['**/*.{js,jsx,mjs,ts,tsx,mts,cts}'], rules: ODSLONIETE_PRZEZ_NEXT_16 },
  // P-12 (2026-09-24): pełny zestaw zalecany jsx-a11y jako błędy (WCAG 2.1 AA — etykiety pól,
  // obsługa klawiatury, role). eslint-config-next włącza tylko kilka reguł tej wtyczki; ten sam
  // zakres plików co w eslint-config-next, bo tylko tam wtyczka jest zarejestrowana (X-42).
  { files: ['**/*.{js,jsx,mjs,ts,tsx,mts,cts}'], rules: jsxA11y.flatConfigs.recommended.rules },
];

export default config;
