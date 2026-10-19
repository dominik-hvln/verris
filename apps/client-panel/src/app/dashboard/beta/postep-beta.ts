import { SCENARIUSZE_BETA, type PostepBetaDto, type ScenariuszBeta } from "@verris/contracts";

/** Odhaczenie od razu w widoku (zanim odpowie API); błąd zapisu cofa je do stanu z serwera. */
export function zastosujKrok(p: PostepBetaDto, krokId: string, zrobione: boolean, teraz = new Date()): PostepBetaDto {
  const kroki = { ...p.kroki };
  if (zrobione) kroki[krokId] = teraz.toISOString();
  else delete kroki[krokId];
  return { ...p, kroki };
}

export function postepScenariusza(s: ScenariuszBeta, kroki: Record<string, string>) {
  const zrobione = s.kroki.filter((k) => kroki[k.id]).length;
  return { zrobione, wszystkie: s.kroki.length, gotowy: zrobione === s.kroki.length };
}

/** Pierwszy scenariusz z czymś do zrobienia — tam prowadzi „Kontynuuj”. */
export function nastepnyScenariusz(kroki: Record<string, string>): ScenariuszBeta | null {
  return SCENARIUSZE_BETA.find((s) => !postepScenariusza(s, kroki).gotowy) ?? null;
}
