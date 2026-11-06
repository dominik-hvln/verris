"use server";

import type { PostepBetaDto } from "@verris/contracts/klient";
import { apiFetch } from "@/lib/api";

/** PB-26 — strona „Testy (beta)”: postęp zalogowanego testera (kroki i uwagi). */
export async function pobierzPostepBetaAction(): Promise<PostepBetaDto> {
  return apiFetch<PostepBetaDto>("/me/beta/postep");
}

/**
 * P1-11 — stan konta w testach: tester (zrealizował kod) albo ma niewykorzystane zaproszenie (pulpit: „Wpisz kod
 * z zaproszenia”). Błąd API = nic nie pokazujemy (pulpit działa bez tej informacji).
 */
export async function pobierzStanBetyAction(): Promise<{ tester: boolean; zaproszenie: boolean }> {
  try {
    const r = await apiFetch<{ tester?: boolean; zaproszenie?: boolean }>("/me/beta");
    return { tester: r.tester === true, zaproszenie: r.zaproszenie === true };
  } catch {
    return { tester: false, zaproszenie: false };
  }
}

type Wynik = { ok: true; postep: PostepBetaDto } | { ok: false; blad: string };

function opisBledu(err: unknown): string {
  const m = (err as { message?: unknown })?.message;
  return typeof m === "string" && m ? m : "Nie udało się zapisać – spróbuj ponownie.";
}

export async function ustawKrokBetaAction(krokId: string, zrobione: boolean): Promise<Wynik> {
  try {
    const postep = await apiFetch<PostepBetaDto>("/me/beta/postep/krok", {
      method: "PUT",
      body: JSON.stringify({ krokId, zrobione }),
    });
    return { ok: true, postep };
  } catch (err) {
    return { ok: false, blad: opisBledu(err) };
  }
}

export async function ustawUwageBetaAction(scenariuszId: string, tekst: string): Promise<Wynik> {
  try {
    const postep = await apiFetch<PostepBetaDto>("/me/beta/postep/uwaga", {
      method: "PUT",
      body: JSON.stringify({ scenariuszId, tekst }),
    });
    return { ok: true, postep };
  } catch (err) {
    return { ok: false, blad: opisBledu(err) };
  }
}
