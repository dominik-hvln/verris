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

export default [
  { ignores: ['.next/**', 'node_modules/**', 'dist/**', 'out/**', 'next-env.d.ts'] },
  ...coreWebVitals,
  ...nextTypescript,
  { rules: ODSLONIETE_PRZEZ_NEXT_16 },
];
