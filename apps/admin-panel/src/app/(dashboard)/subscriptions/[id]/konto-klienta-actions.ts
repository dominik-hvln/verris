"use server";

import { adminApi, AdminApiError } from "@/lib/api";
import { czySekcjaKonta, type DaneSekcji, type ParametrySekcji, type SekcjaKonta } from "./konto-klienta-widok";

/** PB-42 — jedna sekcja konta klienta na żądanie (odczyt z serwera + wpis w dzienniku po stronie API). */
export async function wczytajSekcjeKontaAction(
  subscriptionId: string,
  sekcja: SekcjaKonta,
  parametry: ParametrySekcji = {},
): Promise<{ ok: true; wynik: DaneSekcji } | { ok: false; error: string }> {
  if (!czySekcjaKonta(sekcja)) return { ok: false, error: "Nieznana sekcja konta." };
  const q = new URLSearchParams();
  if (parametry.domain) q.set("domain", parametry.domain);
  if (sekcja === "logi") {
    q.set("type", parametry.type === "access" ? "access" : "error");
    q.set("lines", String(parametry.lines ?? 200));
  }
  const qs = q.toString();
  try {
    const dane = await adminApi(`/admin/subscriptions/${encodeURIComponent(subscriptionId)}/konto/${sekcja}${qs ? `?${qs}` : ""}`);
    return { ok: true, wynik: { sekcja, dane } as DaneSekcji };
  } catch (err) {
    if (err instanceof AdminApiError && err.status === 403) {
      return { ok: false, error: "Twoja rola nie ma uprawnienia „Podgląd konta klienta”. Uprawnienie nadaje się w rolach operatorów." };
    }
    if (err instanceof AdminApiError) return { ok: false, error: err.message };
    return { ok: false, error: "Nie udało się wczytać danych konta. Spróbuj ponownie." };
  }
}
