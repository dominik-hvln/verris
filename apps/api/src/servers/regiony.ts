/**
 * P-13 — kody regionów węzła, które panel klienta zamienia na deklarację lokalizacji
 * danych (libs/contracts/src/lokalizacja.ts). Kopia listy kluczy, bo API bundlowane
 * webpackiem nie może importować WARTOŚCI z @verris/contracts (paczka to źródła .ts,
 * a node_modules są zewnętrzne) — zgodność obu list pilnuje src/test/regiony-danych.spec.ts.
 */
export const KODY_REGIONOW = ['DE-FSN', 'DE-NBG', 'FI-HEL', 'PL-WAW', 'PL-POZ'] as const;
