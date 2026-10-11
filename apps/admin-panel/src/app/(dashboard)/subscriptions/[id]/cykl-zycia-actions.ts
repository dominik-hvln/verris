"use server";

import { revalidatePath } from "next/cache";
import { AdminApiError, adminApi } from "@/lib/api";

/**
 * F3.5 — cykl życia usługi z karty (apps/api/src/subscriptions/cykl-zycia-uslugi.admin.controller.ts) i dodatki
 * dodawane przez obsługę (apps/api/src/addons/dodatki-operatora.admin.controller.ts).
 */
export type WynikCyklu = { ok: true; komunikat: string } | { ok: false; error: string };

/** Biała lista ścieżek — akcja serwerowa przyjmuje dane z przeglądarki. */
const OPERACJE = ["anulacja", "anulacja/cofnij", "data-odnowienia", "obietnica-zaplaty", "obietnica-zaplaty/odwolaj"] as const;
export type OperacjaCyklu = (typeof OPERACJE)[number];

const blad = (e: unknown) => (e instanceof AdminApiError || e instanceof Error ? e.message : "Nie udało się.");

export async function cyklZyciaAction(subscriptionId: string, co: OperacjaCyklu, body: Record<string, unknown>): Promise<WynikCyklu> {
  if (!OPERACJE.includes(co)) return { ok: false, error: "Nieznana operacja." };
  try {
    const r = await adminApi<{ komunikat?: string }>(`/admin/subscriptions/${encodeURIComponent(subscriptionId)}/${co}`, { method: "POST", body });
    revalidatePath(`/subscriptions/${subscriptionId}`);
    return { ok: true, komunikat: r?.komunikat ?? "Zapisano." };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}

export interface DodatkiUslugi {
  catalog: { slug: string; name: string; description: string; price: string; currency: string }[];
  purchased: { id: string; slug: string; name: string; amount: string; status: string; createdAt: string }[];
}

export async function dodatkiUslugiAction(subscriptionId: string): Promise<{ ok: true; wynik: DodatkiUslugi } | { ok: false; error: string }> {
  try {
    return { ok: true, wynik: await adminApi<DodatkiUslugi>(`/admin/subscriptions/${encodeURIComponent(subscriptionId)}/dodatki`) };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}

export async function dodajDodatekAction(
  subscriptionId: string,
  body: { slug: string; platnosc: "PORTFEL" | "GRATIS"; powod: string; zgloszenie?: string; klucz: string },
): Promise<WynikCyklu> {
  try {
    const r = await adminApi<{ name: string; duplikat?: boolean }>(`/admin/subscriptions/${encodeURIComponent(subscriptionId)}/dodatki`, {
      method: "POST",
      body: { ...body, zgloszenie: body.zgloszenie?.trim() || undefined },
    });
    revalidatePath(`/subscriptions/${subscriptionId}`);
    return { ok: true, komunikat: r.duplikat ? `Dodatek „${r.name}” był już dodany.` : `Dodano dodatek „${r.name}”.` };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}
