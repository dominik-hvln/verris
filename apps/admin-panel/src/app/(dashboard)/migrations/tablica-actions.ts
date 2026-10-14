"use server";

import { revalidatePath } from "next/cache";
import { adminApi, AdminApiError } from "@/lib/api";
import type { ObslugaMigracji, PodgladRaportu } from "./tablica-typy";

/**
 * D11 — działania tablicy migracji (apps/api/src/subscriptions/tablica-migracji.controller.ts, MIGRATIONS_MANAGE).
 * Ścieżki z białej listy — przeglądarka nie poda dowolnej trasy API; 403 strażnika jako nazwa uprawnienia.
 */
export type Wynik<T> = { ok: true; wynik: T } | { ok: false; error: string };

const DZIALANIA = {
  etap: "etap",
  ustawienia: "ustawienia",
  checklista: "checklista",
  kontakty: "kontakty",
  raport: "raport",
  "sprawdz-dns": "sprawdz-dns",
} as const;
export type DzialanieTablicy = keyof typeof DZIALANIA;

function komunikat(err: unknown): string {
  if (err instanceof AdminApiError && err.status === 403 && /uprawnie|^forbidden$/i.test(err.message)) {
    return "Twoja rola nie ma uprawnienia MIGRATIONS_MANAGE.";
  }
  if (err instanceof Error) return err.message;
  return "Nie udało się. Spróbuj ponownie.";
}

export async function dzialanieTablicyAction<T = ObslugaMigracji>(
  migrationId: string,
  dzialanie: DzialanieTablicy,
  dane: Record<string, unknown> = {},
): Promise<Wynik<T>> {
  const sciezka = Object.hasOwn(DZIALANIA, dzialanie) ? DZIALANIA[dzialanie] : undefined;
  if (!sciezka) return { ok: false, error: "Nieznane działanie." };
  try {
    const wynik = await adminApi<T>(`/admin/migrations/${encodeURIComponent(migrationId)}/${sciezka}`, { method: "POST", body: dane });
    revalidatePath("/migrations/tablica");
    revalidatePath(`/migrations/${migrationId}`);
    return { ok: true, wynik };
  } catch (err) {
    return { ok: false, error: komunikat(err) };
  }
}

export async function podgladRaportuAction(migrationId: string): Promise<Wynik<PodgladRaportu>> {
  try {
    return { ok: true, wynik: await adminApi<PodgladRaportu>(`/admin/migrations/${encodeURIComponent(migrationId)}/raport`) };
  } catch (err) {
    return { ok: false, error: komunikat(err) };
  }
}

/**
 * 15.10 — tymczasowy adres podglądu strony klienta przed zmianą DNS (GET /admin/subscriptions/:id/podglad,
 * CUSTOMERS_VIEW). Do testu „Wynik testu strony na tymczasowym adresie”.
 */
export async function adresPodgladuAction(subscriptionId: string): Promise<Wynik<{ url: string; wygasa: string }>> {
  try {
    return { ok: true, wynik: await adminApi<{ url: string; wygasa: string }>(`/admin/subscriptions/${encodeURIComponent(subscriptionId)}/podglad`) };
  } catch (e) {
    return { ok: false, error: komunikat(e) };
  }
}
