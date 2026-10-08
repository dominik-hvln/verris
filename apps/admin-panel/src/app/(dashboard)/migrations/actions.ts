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

/**
 * PB-45 / ADMIN-MIGR — zlecenie migracji za klienta (to samo co kreator klienta + usługa, powód i opcjonalnie zgłoszenie).
 * Te same trasy co panel obsługi (`staff/migrations/za-klienta…` wpuszczają ADMIN); kształt zlecenia musi być identyczny
 * z apps/staff-panel/…/migrations/actions.ts — pilnuje tego za-klienta/formularz-za-klienta.spec.tsx.
 */
export interface MigracjaZaKlientaInput {
  subscriptionId: string;
  powod: string;
  ticketId?: string;
  targetDomain?: string;
  sourceDomain?: string;
  ftp?: { protocol: 'sftp' | 'ftp' | 'ftps'; host: string; port: number; username: string; password: string; remotePath?: string };
  mysql?: Array<{ host: string; port: number; database: string; username?: string; password?: string }>;
  imap?: Array<{ email: string; host: string; password: string }>;
  utworzBrakujaceSkrzynki?: boolean;
  notes?: string;
}

export interface PreflightZaKlienta {
  ok: boolean;
  checks: Array<{ kind: string; target: string; status: string; message: string }>;
}

/** PB-45 — test dostępów do starego hostingu z formularza (realne logowanie, nic nie zapisuje). */
export async function testDostepowZaKlientaAction(
  input: MigracjaZaKlientaInput,
): Promise<{ ok: true; wynik: PreflightZaKlienta } | { error: string }> {
  try {
    // Test dostępów nie zapisuje niczego — powód i zgłoszenie są potrzebne dopiero przy założeniu.
    const body = { ...input, powod: undefined, ticketId: undefined };
    const wynik = await adminApi<PreflightZaKlienta>('/staff/migrations/za-klienta/preflight', { method: 'POST', body });
    return { ok: true, wynik };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Test dostępów nie powiódł się.' };
  }
}

/** PB-45 — założenie migracji za klienta: klient dostaje mail z prośbą o zgodę, start dopiero po niej. */
export async function utworzMigracjeZaKlientaAction(
  input: MigracjaZaKlientaInput,
): Promise<{ ok: true; id: string; wygasa: string; mailWyslany: boolean } | { error: string }> {
  try {
    const res = await adminApi<{ migracja: { id: string }; wygasa: string; mailWyslany: boolean }>('/staff/migrations/za-klienta', {
      method: 'POST',
      body: input,
    });
    revalidatePath('/migrations');
    return { ok: true, id: res.migracja.id, wygasa: res.wygasa, mailWyslany: res.mailWyslany };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Nie udało się przygotować migracji za klienta.' };
  }
}

/** PB-45 — anulowanie migracji czekającej na zgodę klienta: link przestaje działać, dane źródła są kasowane od razu. */
export async function anulujProsbeZgodyAction(input: { migrationId: string }): Promise<{ ok: true } | { error: string }> {
  try {
    await adminApi(`/staff/migrations/${input.migrationId}/status`, {
      method: 'POST',
      body: { status: 'CANCELED', note: 'Anulowano prośbę o zgodę klienta (migracja za klienta).' },
    });
    revalidatePath('/migrations');
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Nie udało się anulować prośby.' };
  }
}
