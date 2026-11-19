/**
 * Wejście dla przeglądarki (panel klienta, komponenty 'use client'): model strony z walidacją, katalogi,
 * wersje kreatora, katalog stylów i fontów oraz kolory palet. Bez renderera (CSS/JS stron, znak, SEO)
 * i bez master promptu – te zostają w pełnym wejściu `@verris/kreator` (API i trasy serwerowe panelu).
 * Pilnuje apps/client-panel/src/lib/bundel-klienta.spec.ts (drzewo modułów tego pliku bez `render/` i `ai/`
 * poza samymi typami kontraktu).
 */
export * from './model.ts';
export * from './jezyki.ts';
export * from './edycja.ts';
export * from './katalog.ts';
export * from './plany.ts';
export { TYPY_STRON, type BriefStrony, type KierunekProjektu, type TypStrony } from './ai/kontrakt.ts';
export * from './style/katalog-stylow.ts';
export { generujPalete, kontrast, korygujPalete, MIN_KONTRAST_AA, PARY_KONTRASTU, sprawdzKontrastPalety } from './style/kolory.ts';
// Paczka 130 – marka na stronie: schemat migawki i typy podglądu zmian (bez renderera SVG na stronę).
export { MarkaStrony } from './marka-strony/model.ts';
export { ELEMENTY_MARKI, type ElementMarki, type OpcjeZastosowaniaMarki, type StanMarkiStrony, type WygladMarki, type ZmianaMarki } from './marka-strony/zastosuj.ts';
