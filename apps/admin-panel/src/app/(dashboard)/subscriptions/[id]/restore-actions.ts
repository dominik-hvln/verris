'use server';

import { revalidatePath } from 'next/cache';
import { adminApi, AdminApiError } from '@/lib/api';

export type KopiaKonta = { id: string; fileName: string };
export type StanOdtwarzania = {
  id: string;
  status: string;
  backupFileName: string;
  scope: { files: boolean; databases: boolean; email: boolean };
  safetyBackup: boolean;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
} | null;

const msg = (e: unknown) => (e instanceof AdminApiError || e instanceof Error ? e.message : 'Nie udało się.');

/** H-18 — kopie konta i ostatnie odtworzenie (dla panelu operatora). */
export async function fetchRestoreDataAction(id: string): Promise<
  { backups: KopiaKonta[]; fetchError: string | null; last: StanOdtwarzania } | { error: string }
> {
  try {
    const [b, last] = await Promise.all([
      adminApi<{ rows: KopiaKonta[]; fetchError: string | null }>(`/admin/subscriptions/${id}/hosting-backups`),
      adminApi<StanOdtwarzania>(`/admin/subscriptions/${id}/hosting-restore/status`),
    ]);
    return { backups: b.rows, fetchError: b.fetchError, last };
  } catch (e) {
    return { error: msg(e) };
  }
}

export async function startRestoreAction(
  id: string,
  input: { backupId: string; scopeFiles: boolean; scopeDatabases: boolean; scopeEmail: boolean; safetyBackup: boolean },
): Promise<{ ok: true } | { error: string }> {
  try {
    await adminApi(`/admin/subscriptions/${id}/hosting-restore`, { method: 'POST', body: input });
    revalidatePath(`/subscriptions/${id}`);
    return { ok: true };
  } catch (e) {
    return { error: msg(e) };
  }
}
