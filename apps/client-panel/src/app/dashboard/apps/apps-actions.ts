'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, ApiError } from '@/lib/api';

export interface AppCatalogItem {
  slug: string;
  name: string;
  description: string;
}

export interface AppInstallRow {
  id: string;
  app: string | null;
  status: string;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface AppsStatus {
  domain: string;
  catalog: AppCatalogItem[];
  installs: AppInstallRow[];
}

export interface AppInstallResult {
  ok: true;
  app: string;
  domain: string;
  adminUrl: string;
  adminUser: string;
  adminPassword: string;
  note: string;
}

export async function fetchAppsStatus(serviceId: string): Promise<AppsStatus | null> {
  try {
    return await apiFetch<AppsStatus>(`/services/${serviceId}/apps`);
  } catch {
    return null;
  }
}

export async function installAppAction(
  serviceId: string,
  input: { app: string; adminUser: string; adminEmail: string; adminPassword?: string },
): Promise<{ ok: true; data: AppInstallResult } | { ok: false; error: string }> {
  try {
    const data = await apiFetch<AppInstallResult>(`/services/${serviceId}/apps/install`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
    revalidatePath('/dashboard/apps');
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Błąd' };
  }
}
