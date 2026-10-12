"use server";

import { revalidatePath } from "next/cache";
import { AdminApiError, adminApi } from "@/lib/api";

/** K2 (PB-53.5) — zmiana właściciela usługi (apps/api/src/subscriptions/zmiana-wlasciciela.admin.controller.ts, tylko ADMIN). */
export interface PodgladZmianyWlasciciela {
  usluga: { id: string; domena: string; obecnyWlasciciel: string };
  nowyWlasciciel: { id: string; email: string; imie: string | null } | null;
  odmowy: string[];
  uwagi: string[];
}

const blad = (e: unknown) => (e instanceof AdminApiError || e instanceof Error ? e.message : "Nie udało się.");
const sciezka = (id: string) => `/admin/subscriptions/${encodeURIComponent(id)}/zmiana-wlasciciela`;

export async function podgladZmianyWlascicielaAction(subscriptionId: string, email: string): Promise<{ ok: true; wynik: PodgladZmianyWlasciciela } | { ok: false; error: string }> {
  try {
    return { ok: true, wynik: await adminApi<PodgladZmianyWlasciciela>(`${sciezka(subscriptionId)}?email=${encodeURIComponent(email.trim())}`) };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}

export async function zmienWlascicielaAction(
  subscriptionId: string,
  body: { email: string; powod: string; potwierdzenie: string },
): Promise<{ ok: true; komunikat: string; nowyWlascicielId: string } | { ok: false; error: string }> {
  try {
    const r = await adminApi<{ komunikat: string; nowyWlasciciel: { id: string } }>(sciezka(subscriptionId), {
      method: "POST",
      body: { email: body.email.trim(), powod: body.powod.trim(), potwierdzenie: body.potwierdzenie.trim() },
    });
    revalidatePath(`/subscriptions/${subscriptionId}`);
    return { ok: true, komunikat: r.komunikat, nowyWlascicielId: r.nowyWlasciciel.id };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}
