'use server';

import { apiFetch } from '@/lib/api';
import { revalidatePath } from 'next/cache';

export interface MigrationFtpInput {
  host: string;
  port: number;
  username: string;
  password: string;
  remotePath?: string;
  protocol?: 'ftp' | 'ftps' | 'sftp';
}
export interface MigrationMysqlInput {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
}
export interface MigrationImapInput {
  host: string;
  port: number;
  username: string;
  password: string;
  email?: string;
}

export interface MigrationBundleInput {
  serviceId: string;
  targetDomain?: string;
  sourceDomain?: string;
  sourcePanelType?: string;
  ftp?: MigrationFtpInput;
  mysql?: MigrationMysqlInput[];
  imap?: MigrationImapInput[];
  notes?: string;
  consentAccepted?: boolean;
}

type ActionOk<T> = ({ ok: true } & T) | { error: string };

function bundleBody(input: MigrationBundleInput) {
  return {
    targetDomain: input.targetDomain?.trim() || undefined,
    sourceDomain: input.sourceDomain?.trim() || undefined,
    sourcePanelType: input.sourcePanelType || undefined,
    ftp: input.ftp
      ? {
          host: input.ftp.host,
          port: input.ftp.port,
          username: input.ftp.username,
          password: input.ftp.password,
          protocol: input.ftp.protocol ?? 'sftp',
          remotePath: input.ftp.remotePath || '/',
        }
      : undefined,
    mysql: input.mysql && input.mysql.length > 0 ? input.mysql : undefined,
    imap: input.imap && input.imap.length > 0 ? input.imap : undefined,
    notes: input.notes?.trim() || undefined,
    consentAccepted: input.consentAccepted === true ? true : undefined,
  };
}

/** O-2/#18 — auto-discovery: loguje się do panelu źródłowego i zwraca inwentarz. */
export async function discoverMigrationSourceAction(input: {
  serviceId: string;
  host: string;
  port?: number;
  username: string;
  password: string;
  panelType?: 'cpanel' | 'directadmin' | 'plesk';
}): Promise<ActionOk<{ result: unknown }>> {
  try {
    const result = await apiFetch<unknown>(`/services/${input.serviceId}/migrations/discover`, {
      method: 'POST',
      body: JSON.stringify({
        host: input.host,
        port: input.port,
        username: input.username,
        password: input.password,
        panelType: input.panelType,
      }),
    });
    return { ok: true, result };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Nie udało się połączyć z panelem źródłowym.' };
  }
}

/** Preflight — realny test logowania do każdego źródła przed kolejkowaniem. */
export async function preflightMigrationAction(
  input: MigrationBundleInput,
): Promise<ActionOk<{ result: unknown }>> {
  try {
    const result = await apiFetch<unknown>(`/services/${input.serviceId}/migrations/preflight`, {
      method: 'POST',
      body: JSON.stringify(bundleBody(input)),
    });
    return { ok: true, result };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Preflight nie powiódł się.' };
  }
}

/** Zakolejkowanie pełnego pakietu migracji (pliki + wiele baz + wiele skrzynek). */
export async function createMigrationBundleAction(
  input: MigrationBundleInput,
): Promise<ActionOk<{ migration: unknown }>> {
  try {
    const migration = await apiFetch<unknown>(`/services/${input.serviceId}/migrations/bundle`, {
      method: 'POST',
      body: JSON.stringify(bundleBody(input)),
    });
    revalidatePath('/dashboard/migrations');
    return { ok: true, migration };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Nie udało się zakolejkować migracji.' };
  }
}

/** Postęp na żywo — szczegóły zlecenia z krokami (polling z widoku). */
export async function getMigrationBundleDetailAction(input: {
  serviceId: string;
  migrationId: string;
}): Promise<ActionOk<{ detail: unknown }>> {
  try {
    const detail = await apiFetch<unknown>(
      `/services/${input.serviceId}/migrations/bundles/${input.migrationId}`,
    );
    return { ok: true, detail };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Nie udało się pobrać statusu migracji.' };
  }
}

/** Anulowanie migracji przez klienta (zatrzymuje worker). */
export async function cancelMigrationBundleAction(input: {
  serviceId: string;
  migrationId: string;
}): Promise<ActionOk<{ detail: unknown }>> {
  try {
    const detail = await apiFetch<unknown>(
      `/services/${input.serviceId}/migrations/bundles/${input.migrationId}/cancel`,
      { method: 'POST' },
    );
    revalidatePath('/dashboard/migrations');
    return { ok: true, detail };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Nie udało się anulować migracji.' };
  }
}

/** Delta-sync plików i poczty przed cutoverem DNS. */
export async function queueMigrationDeltaSyncAction(input: {
  serviceId: string;
  migrationId: string;
}): Promise<ActionOk<{ detail: unknown }>> {
  try {
    const detail = await apiFetch<unknown>(
      `/services/${input.serviceId}/migrations/bundles/${input.migrationId}/delta-sync`,
      { method: 'POST' },
    );
    revalidatePath('/dashboard/migrations');
    return { ok: true, detail };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Nie udało się uruchomić delta-synca.' };
  }
}

/** Plan cutoveru DNS (rekordy / opcja zmiany NS). */
export async function getMigrationCutoverPlanAction(input: {
  serviceId: string;
  migrationId: string;
}): Promise<ActionOk<{ plan: unknown }>> {
  try {
    const plan = await apiFetch<unknown>(
      `/services/${input.serviceId}/migrations/bundles/${input.migrationId}/cutover`,
    );
    return { ok: true, plan };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Nie udało się pobrać planu cutoveru DNS.' };
  }
}

/** Weryfikacja DNS po zmianie u rejestratora; sukces = cutover zakończony. */
export async function verifyMigrationCutoverAction(input: {
  serviceId: string;
  migrationId: string;
}): Promise<ActionOk<{ plan: unknown }>> {
  try {
    const plan = await apiFetch<unknown>(
      `/services/${input.serviceId}/migrations/bundles/${input.migrationId}/cutover/verify`,
      { method: 'POST' },
    );
    revalidatePath('/dashboard/migrations');
    return { ok: true, plan };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Nie udało się zweryfikować DNS.' };
  }
}
