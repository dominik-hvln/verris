"use server";

import { revalidatePath } from "next/cache";
import { staffApi, StaffApiError } from "@/lib/staff-api";

/**
 * PB-44 (decyzja 08.10) — obsługa na karcie usługi: zasoby, kopie z odtwarzaniem, historia migracji
 * i migracja wewnętrzna. Te same endpointy co panel admina (`/admin/subscriptions/:id/...`), wpuszczają
 * STAFF z uprawnieniem SUBSCRIPTIONS_MANAGE. Odtworzenie na innym węźle (H-16) zostaje tylko dla admina.
 */

export type Wynik<T> = { ok: true; data: T } | { ok: false; error: string; brakUprawnien?: boolean };

export interface ZuzycieUslugi {
  window: string;
  account: null | {
    daUsername: string;
    domain: string;
    status: string;
    serverId: string;
    cpuLimit: number;
    ramLimitMb: number;
    diskLimitMb: number;
    ioLimitKbps: number;
    scaledCpu: number;
    scaledRamMb: number;
    scaledDiskMb: number;
  };
  latest: null | {
    bucketStart: string;
    cpuUsageAvg: number;
    memUsageAvgMb: number;
    diskUsageMb: number;
    ioUsageKbps: number;
  };
  rows: Array<{ bucketStart: string; cpuUsageAvg: number }>;
}

export type KopiaKonta = { id: string; fileName: string };
export type StanOdtwarzania = {
  id: string;
  status: string;
  backupFileName: string;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
} | null;
export interface KopieKonta {
  backups: KopiaKonta[];
  /** Węzeł nie oddał listy — lista może być niepełna. */
  fetchError: string | null;
  last: StanOdtwarzania;
}

/** Komunikat dla operatora: przy 403 — czego brakuje, inaczej treść błędu z API. */
function komunikat(e: unknown, domyslny: string, uprawnienie = "Subskrypcje i usługi"): { error: string; brakUprawnien?: boolean } {
  if (e instanceof StaffApiError && e.status === 403) {
    return { error: `Twoja rola nie ma uprawnienia „${uprawnienie}”. Poproś administratora o jego nadanie.`, brakUprawnien: true };
  }
  if (e instanceof StaffApiError) return { error: e.message };
  return { error: domyslny };
}

export async function pobierzZuzycieAction(subscriptionId: string): Promise<Wynik<ZuzycieUslugi>> {
  try {
    return { ok: true, data: await staffApi<ZuzycieUslugi>(`/admin/subscriptions/${subscriptionId}/usage?window=24h`) };
  } catch (e) {
    return { ok: false, ...komunikat(e, "Nie udało się pobrać zużycia zasobów.") };
  }
}

export async function pobierzKopieAction(subscriptionId: string): Promise<Wynik<KopieKonta>> {
  try {
    const [b, last] = await Promise.all([
      staffApi<{ rows: KopiaKonta[]; fetchError: string | null }>(`/admin/subscriptions/${subscriptionId}/hosting-backups`),
      staffApi<StanOdtwarzania>(`/admin/subscriptions/${subscriptionId}/hosting-restore/status`),
    ]);
    return { ok: true, data: { backups: b.rows ?? [], fetchError: b.fetchError ?? null, last } };
  } catch (e) {
    return { ok: false, ...komunikat(e, "Nie udało się pobrać kopii konta z serwera.") };
  }
}

export async function odtworzZKopiiAction(input: {
  subscriptionId: string;
  userId: string;
  backupId: string;
  scopeFiles: boolean;
  scopeDatabases: boolean;
  scopeEmail: boolean;
  safetyBackup: boolean;
  reason: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { subscriptionId, userId, ...body } = input;
  try {
    await staffApi(`/admin/subscriptions/${subscriptionId}/hosting-restore`, { method: "POST", body });
    revalidatePath(`/crm/${userId}/subscriptions/${subscriptionId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, ...komunikat(e, "Nie udało się zlecić odtworzenia.") };
  }
}

export async function zlecMigracjeWewnetrznaAction(input: {
  subscriptionId: string;
  userId: string;
  targetServerId: string;
  notes: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await staffApi(`/admin/subscriptions/${input.subscriptionId}/internal-migration`, {
      method: "POST",
      body: { targetServerId: input.targetServerId, notes: input.notes },
    });
    revalidatePath(`/crm/${input.userId}/subscriptions/${input.subscriptionId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, ...komunikat(e, "Nie udało się zlecić migracji wewnętrznej.") };
  }
}
