/**
 * Komunikat 403 na karcie usługi: nazwy uprawnień jak w katalogu (staff-permissions.catalog.ts). Gdy trasę otwiera
 * którekolwiek z kilku (@StaffPermAny, L1-KARTA) — wymieniamy wszystkie, żeby admin nie nadawał szerszego niż trzeba.
 * Osobny moduł: obsluga-actions.ts ma "use server" i może eksportować tylko funkcje async.
 */
export const SUBSKRYPCJE = "Subskrypcje i usługi";
export const PODGLAD_KLIENTOW = "Podgląd klientów";
export const PODGLAD_KONTA = "Podgląd konta klienta";

export function brakUprawnien(...nazwy: [string, ...string[]]): string {
  const lista = nazwy.map((n) => `„${n}”`).join(" ani ");
  return `Twoja rola nie ma uprawnienia ${lista}. Poproś administratora o ${nazwy.length > 1 ? "nadanie jednego z nich" : "jego nadanie"}.`;
}
