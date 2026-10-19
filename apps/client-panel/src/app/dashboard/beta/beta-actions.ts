"use server";

import type { PostepBetaDto } from "@verris/contracts";
import { apiFetch } from "@/lib/api";

/** PB-26 — strona „Testy (beta)”: postęp zalogowanego testera (kroki i uwagi). */
export async function pobierzPostepBetaAction(): Promise<PostepBetaDto> {
  return apiFetch<PostepBetaDto>("/me/beta/postep");
}

type Wynik = { ok: true; postep: PostepBetaDto } | { ok: false; blad: string };

function opisBledu(err: unknown): string {
  const m = (err as { message?: unknown })?.message;
  return typeof m === "string" && m ? m : "Nie udało się zapisać — spróbuj ponownie.";
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
