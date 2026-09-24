'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, ApiError } from '@/lib/api';

export interface PhpStatus {
  accountId: string;
  domain: string;
  version: string | null;
  availableVersions: string[];
  appliedAt: string | null;
  lastTask: {
    id: string;
    status: string;
    errorMessage: string | null;
    createdAt: string;
    completedAt: string | null;
  } | null;
}

export async function fetchPhpStatus(serviceId: string): Promise<PhpStatus | null> {
  try {
    return await apiFetch<PhpStatus>(`/services/${serviceId}/hosting-php`);
  } catch {
    return null;
  }
}

/** FALA-2b — wersja PHP per domena (selektor DA). */
export interface DomainPhpStatus {
  domain: string;
  slotReleases: string[];
  currentSlot: number | null;
  currentVersion: string | null;
}

export async function fetchDomainPhp(
  serviceId: string,
  domain: string,
): Promise<DomainPhpStatus | null> {
  try {
    return await apiFetch<DomainPhpStatus>(
      `/services/${serviceId}/hosting-domain-php?domain=${encodeURIComponent(domain)}`,
    );
  } catch {
    return null;
  }
}

export async function setDomainPhp(
  serviceId: string,
  domain: string,
  version: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await apiFetch(`/services/${serviceId}/hosting-domain-php`, {
      method: 'POST',
      body: JSON.stringify({ domain, version }),
    });
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Błąd',
    };
  }
}

export async function setPhpVersion(
  serviceId: string,
  version: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await apiFetch(`/services/${serviceId}/hosting-php`, {
      method: 'POST',
      body: JSON.stringify({ version }),
    });
    revalidatePath('/dashboard/php');
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Błąd',
    };
  }
}

/** B-05 — dyrektywy PHP domeny (.user.ini, blok zarządzany przez panel). */
export interface PhpIniStatus {
  domain: string;
  values: Record<string, string>;
  /** Linie wpisane przez klienta poza blokiem panelu — zostają nietknięte. */
  wlasneDyrektywy: number;
}

export async function fetchPhpIni(serviceId: string, domain: string): Promise<PhpIniStatus | { error: string }> {
  try {
    return await apiFetch<PhpIniStatus>(`/services/${serviceId}/hosting-php-ini?domain=${encodeURIComponent(domain)}`);
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Nie udało się odczytać ustawień PHP.' };
  }
}

export async function savePhpIni(
  serviceId: string,
  domain: string,
  values: Record<string, string>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await apiFetch(`/services/${serviceId}/hosting-php-ini`, {
      method: 'POST',
      body: JSON.stringify({ domain, values }),
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Błąd' };
  }
}
