"use server";

import { revalidatePath } from "next/cache";
import { adminApi, AdminApiError } from "@/lib/api";

export type Wynik = { ok: true; ticketId?: string } | { ok: false; error: string };

const blad = (e: unknown, d: string): Wynik => ({ ok: false, error: e instanceof AdminApiError ? e.message : d });

/** F3.7 — mail z kolejki do klienta (adres konta) albo do zgłoszenia (#xxxxxxxx) — TICKETS_MANAGE. */
export async function przypiszPocztaAction(id: string, cel: { email?: string; zgloszenieId?: string }): Promise<Wynik> {
  try {
    const r = await adminApi<{ ticketId: string }>(`/admin/poczta-zgloszen/${encodeURIComponent(id)}/przypisz`, { method: "POST", body: cel });
    revalidatePath("/tickets/poczta");
    return { ok: true, ticketId: r.ticketId };
  } catch (e) {
    return blad(e, "Nie udało się przypisać wiadomości.");
  }
}

export async function odrzucPocztaAction(id: string, powod: string, zablokuj: boolean): Promise<Wynik> {
  try {
    await adminApi(`/admin/poczta-zgloszen/${encodeURIComponent(id)}/odrzuc`, { method: "POST", body: { powod, zablokuj } });
    revalidatePath("/tickets/poczta");
    return { ok: true };
  } catch (e) {
    return blad(e, "Nie udało się odrzucić wiadomości.");
  }
}

export async function blokadaNadawcyAction(wzorzec: string, dodaj: boolean, powod?: string): Promise<Wynik> {
  try {
    await adminApi(`/admin/poczta-zgloszen/blokady${dodaj ? "" : "/usun"}`, { method: "POST", body: { wzorzec, ...(powod ? { powod } : {}) } });
    revalidatePath("/tickets/poczta");
    return { ok: true };
  } catch (e) {
    return blad(e, "Nie udało się zmienić blokady.");
  }
}
