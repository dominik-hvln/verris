"use server";

import { revalidatePath } from "next/cache";
import { adminApi, AdminApiError } from "@/lib/api";

export type RodzajAuto = "POTWIERDZENIE" | "ZAJMUJE_SIE" | "WCIAZ_PRACUJEMY" | "PODZIEKOWANIE";

export interface AutoWiadomosc {
  rodzaj: RodzajAuto;
  nazwa: string;
  kiedy: string;
  domyslna: string;
  wlaczone: boolean;
  tresc: string;
}

export interface WidokAuto {
  zmienne: string[];
  wiadomosci: AutoWiadomosc[];
}

export interface OcenaAgenta {
  agentId: string;
  nazwa: string;
  ocen: number;
  opiekun: number | null;
  support: number | null;
  rozwiazanePct: number | null;
}

export async function zapiszAutoWiadomosc(
  rodzaj: RodzajAuto,
  v: { wlaczone: boolean; tresc: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await adminApi("/admin/support/auto-messages", { method: "PUT", body: { [rodzaj]: v } });
    revalidatePath("/settings/support");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof AdminApiError ? e.message : "Nie udało się zapisać." };
  }
}
