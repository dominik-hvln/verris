'use server';

import { revalidatePath } from 'next/cache';
import { adminApi } from '@/lib/api';

/** Rozwiązanie eskalacji: wznów automat (requeue) albo zamknij (completed/failed). */
export async function resolveMigrationAttentionAction(input: {
  migrationId: string;
  outcome: 'requeue' | 'completed' | 'failed';
  note?: string;
}): Promise<{ ok: true } | { error: string }> {
  try {
    await adminApi(`/staff/migrations/${input.migrationId}/resolve-attention`, {
      method: 'POST',
      body: { outcome: input.outcome, note: input.note ?? undefined },
    });
    revalidatePath('/migrations');
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Nie udało się rozwiązać eskalacji.' };
  }
}

/** Ponowienie pojedynczego kroku migracji (świeży licznik prób). */
export async function retryMigrationJobAction(input: {
  migrationId: string;
  jobId: string;
}): Promise<{ ok: true } | { error: string }> {
  try {
    await adminApi(`/staff/migrations/${input.migrationId}/jobs/${input.jobId}/retry`, {
      method: 'POST',
    });
    revalidatePath('/migrations');
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Nie udało się ponowić kroku.' };
  }
}

/** Pełne szczegóły zlecenia (joby, logi, payloady) — do panelu szczegółów. */
export async function getMigrationDetailAction(input: {
  migrationId: string;
}): Promise<{ ok: true; detail: unknown } | { error: string }> {
  try {
    const detail = await adminApi<unknown>(`/staff/migrations/${input.migrationId}/detail`);
    return { ok: true, detail };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Nie udało się pobrać szczegółów.' };
  }
}

/**
 * Odsłonięcie sekretów źródła (hasła FTP/MySQL/IMAP) — audytowane, wymaga
 * powodu (min. 10 znaków). Zwraca odszyfrowany bundle.
 */
export async function revealMigrationSecretsAction(input: {
  migrationId: string;
  reason: string;
}): Promise<{ ok: true; bundle: unknown } | { error: string }> {
  try {
    const res = await adminApi<{ bundle: unknown }>(
      `/staff/migrations/${input.migrationId}/reveal-secrets`,
      { method: 'POST', body: { reason: input.reason } },
    );
    return { ok: true, bundle: res.bundle };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Nie udało się odsłonić danych dostępowych.' };
  }
}

/** Rozwiązanie eskalacji z notatką (z poziomu strony szczegółów). */
export async function resolveMigrationAttentionWithNoteAction(input: {
  migrationId: string;
  outcome: 'requeue' | 'completed' | 'failed';
  note?: string;
}): Promise<{ ok: true } | { error: string }> {
  return resolveMigrationAttentionAction(input);
}
