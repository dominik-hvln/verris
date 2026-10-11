import { brakUprawnienia, type DostepDoAkcji } from "./akcje/wezel";

/**
 * Weryfikacja 11.10 — zapis w bazie wiedzy (artykuły i kategorie CMS, dokumenty „Wiedzy AI”) tylko z KB_MANAGE
 * (API: kb.admin.controller.ts, ai-knowledge.admin.controller.ts). Bez uprawnienia przyciski są wyszarzone z tym
 * powodem — nie ukryte i nie aktywne. „Wyślij wniosek” tu nie ma: rejestr wniosków (wnioski/rejestr-wnioskow.ts)
 * zna tylko operacje na klientach, usługach, finansach i węzłach.
 */
export const BEZ_KB_MANAGE = "Wymaga uprawnienia Baza wiedzy (KB_MANAGE)";

/** Powód blokady zapisu w bazie wiedzy; null — wolno. */
export function blokadaBazyWiedzy(dostep: DostepDoAkcji): string | null {
  return brakUprawnienia("KB_MANAGE", dostep) ? BEZ_KB_MANAGE : null;
}
