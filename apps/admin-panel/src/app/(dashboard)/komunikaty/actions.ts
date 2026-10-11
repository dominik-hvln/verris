"use server";

import { revalidatePath } from "next/cache";
import { adminApi, AdminApiError } from "@/lib/api";

/** F3.8 (ON-01) — komunikaty serwisowe (apps/api/src/komunikacja: admin/komunikaty-serwisowe, SERVICE_NOTICES_SEND). */
export type Zakres = "WEZEL" | "PLAN";
export type Wynik<T> = { ok: true; wynik: T } | { ok: false; error: string };

export interface PodgladKomunikatu {
  zakres: Zakres;
  cel: { id: string; nazwa: string };
  odbiorcow: number;
  przekroczono: boolean;
  przyklad: { id: string; email: string; nazwa: string | null }[];
  temat: string;
  podgladTekst: string;
  minutWysylki: number;
}

const blad = (err: unknown) =>
  err instanceof AdminApiError && err.status === 403 && /uprawnie|^forbidden$/i.test(err.message)
    ? "Twoja rola nie wysyła komunikatów serwisowych (wymaga SERVICE_NOTICES_SEND — kierownik zmiany)."
    : err instanceof Error
      ? err.message
      : "Nie udało się. Spróbuj ponownie.";

export async function podgladKomunikatuAction(d: { zakres: Zakres; celId: string; temat: string; tresc: string }): Promise<Wynik<PodgladKomunikatu>> {
  try {
    return { ok: true, wynik: await adminApi<PodgladKomunikatu>("/admin/komunikaty-serwisowe/podglad", { method: "POST", body: d }) };
  } catch (err) {
    return { ok: false, error: blad(err) };
  }
}

export async function zlecKomunikatAction(d: { zakres: Zakres; celId: string; temat: string; tresc: string; powod: string }): Promise<Wynik<{ id: string }>> {
  try {
    const wynik = await adminApi<{ id: string }>("/admin/komunikaty-serwisowe", { method: "POST", body: { ...d, powod: d.powod.trim() } });
    revalidatePath("/komunikaty");
    return { ok: true, wynik };
  } catch (err) {
    return { ok: false, error: blad(err) };
  }
}

export async function zatrzymajKomunikatAction(id: string): Promise<Wynik<unknown>> {
  try {
    const wynik = await adminApi(`/admin/komunikaty-serwisowe/${encodeURIComponent(id)}/zatrzymaj`, { method: "POST", body: {} });
    revalidatePath("/komunikaty");
    return { ok: true, wynik };
  } catch (err) {
    return { ok: false, error: blad(err) };
  }
}
