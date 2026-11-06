import { SCENARIUSZE_BETA, SCENARIUSZE_BETA_POCZTA, policzPostepBeta, type PostepBetaDto, type ScenariuszBeta } from "@verris/contracts/klient";

/**
 * Przewodnik testera (PDF) — trasa z kontrolą sesji (przewodnik/route.ts); ten sam adres podaje mail z zaproszeniem
 * (SCIEZKA_PRZEWODNIKA_TESTERA w apps/api/src/beta/beta.templates.ts). Zwykły moduł, bo czyta go też komponent serwerowy.
 */
export const ADRES_PRZEWODNIKA = "/dashboard/beta/przewodnik";

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

/** Pierwszy obowiązkowy scenariusz z czymś do zrobienia — tam prowadzi „Kontynuuj” (blok techniczny jest opcjonalny). */
export function nastepnyScenariusz(kroki: Record<string, string>): ScenariuszBeta | null {
  return SCENARIUSZE_BETA.find((s) => !s.opcjonalny && !postepScenariusza(s, kroki).gotowy) ?? null;
}

/**
 * Kafelek „Testy (beta)” na pulpicie: ile kroków z ilu i dokąd dalej. Konto z zaproszenia „tylko poczta” (P4-12)
 * liczy wyłącznie scenariusze oznaczone „Też przy samej poczcie”; pozostałe — jak strona Testy (beta).
 */
export function podsumowanieTestera(p: Pick<PostepBetaDto, "kroki" | "tylkoPoczta">): {
  zrobione: number;
  wszystkie: number;
  nastepny: ScenariuszBeta | null;
} {
  if (p.tylkoPoczta) {
    const lista = SCENARIUSZE_BETA_POCZTA.filter((s) => !s.opcjonalny);
    const zrobione = lista.reduce((n, s) => n + postepScenariusza(s, p.kroki).zrobione, 0);
    const wszystkie = lista.reduce((n, s) => n + s.kroki.length, 0);
    return { zrobione, wszystkie, nastepny: lista.find((s) => !postepScenariusza(s, p.kroki).gotowy) ?? null };
  }
  return { ...policzPostepBeta(p.kroki), nastepny: nastepnyScenariusz(p.kroki) };
}
