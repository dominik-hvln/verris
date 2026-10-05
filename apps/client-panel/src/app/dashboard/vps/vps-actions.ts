'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, ApiError } from '@/lib/api';

export interface VpsPlanDto {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  vcpu: number;
  ramGb: number;
  diskGb: number;
  trafficTb: number;
  location: string;
  priceMonthly: string;
  currency: string;
}

export interface VpsInstanceDto {
  id: string;
  name: string;
  status: 'PROVISIONING' | 'RUNNING' | 'STOPPED' | 'REBOOTING' | 'ERROR' | 'DELETING' | 'DELETED';
  ipv4: string | null;
  ipv6: string | null;
  location: string | null;
  priceMonthly: string;
  currency: string;
  currentPeriodEnd: string | null;
  createdAt: string;
  plan: { name: string; slug: string; vcpu: number; ramGb: number; diskGb: number };
}

type Result<T = void> = { ok: true; data?: T } | { ok: false; error: string };

function err(e: unknown): string {
  return e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Błąd';
}

export async function fetchVpsAvailability(): Promise<boolean> {
  try {
    const r = await apiFetch<{ available: boolean }>('/vps/availability');
    return r.available;
  } catch {
    return false;
  }
}

export async function fetchVpsPlans(): Promise<VpsPlanDto[]> {
  try {
    return await apiFetch<VpsPlanDto[]>('/vps/plans');
  } catch {
    return [];
  }
}

export async function fetchVpsInstances(): Promise<VpsInstanceDto[]> {
  try {
    return await apiFetch<VpsInstanceDto[]>('/vps');
  } catch {
    return [];
  }
}

export async function orderVpsAction(input: {
  planId: string;
  name?: string;
  sshKeyIds?: string[];
  /** Oświadczenie: rozpoczęcie świadczenia przed upływem terminu odstąpienia (upk). */
  immediatePerformanceConsent: boolean;
}): Promise<Result<VpsInstanceDto & { rootPassword: string | null }>> {
  try {
    const data = await apiFetch<VpsInstanceDto & { rootPassword: string | null }>('/vps', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    revalidatePath('/dashboard/vps');
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}

export async function vpsPowerAction(id: string, action: 'on' | 'off' | 'reboot'): Promise<Result> {
  try {
    await apiFetch(`/vps/${id}/power`, { method: 'POST', body: JSON.stringify({ action }) });
    revalidatePath('/dashboard/vps');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}

export async function deleteVpsAction(id: string): Promise<Result> {
  try {
    await apiFetch(`/vps/${id}`, { method: 'DELETE' });
    revalidatePath('/dashboard/vps');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}

export interface SshKeyDto {
  id: string;
  name: string;
  fingerprint: string;
  createdAt: string;
}

export async function fetchSshKeys(): Promise<SshKeyDto[]> {
  try {
    return await apiFetch<SshKeyDto[]>('/vps/ssh-keys');
  } catch {
    return [];
  }
}

export async function addSshKeyAction(input: { name: string; publicKey: string }): Promise<Result<SshKeyDto>> {
  try {
    const data = await apiFetch<SshKeyDto>('/vps/ssh-keys', { method: 'POST', body: JSON.stringify(input) });
    revalidatePath('/dashboard/vps');
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}

export async function deleteSshKeyAction(id: string): Promise<Result> {
  try {
    await apiFetch(`/vps/ssh-keys/${id}`, { method: 'DELETE' });
    revalidatePath('/dashboard/vps');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}

// --- Q-08 snapshoty i reinstalacja, Q-07 konsola ---

export interface VpsSnapshotDto {
  id: string;
  description: string;
  createdAt: string;
  sizeGb: string | null;
  status: 'available' | 'creating' | 'unavailable';
}

export interface VpsSnapshotsDto {
  /** false = snapshoty wyłączone (brak ceny) — tworzenie ukryte. */
  enabled: boolean;
  pricePerGbMonthly: string | null;
  limit: number;
  snapshots: VpsSnapshotDto[];
}

export interface VpsOsImageDto {
  name: string;
  description: string;
}

export async function fetchVpsSnapshots(id: string): Promise<Result<VpsSnapshotsDto>> {
  try {
    return { ok: true, data: await apiFetch<VpsSnapshotsDto>(`/vps/${id}/snapshots`) };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}

export async function createVpsSnapshotAction(id: string, description: string): Promise<Result<VpsSnapshotDto>> {
  try {
    const data = await apiFetch<VpsSnapshotDto>(`/vps/${id}/snapshots`, {
      method: 'POST',
      body: JSON.stringify({ description: description || undefined }),
    });
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}

export async function deleteVpsSnapshotAction(id: string, snapshotId: string): Promise<Result> {
  try {
    await apiFetch(`/vps/${id}/snapshots/${snapshotId}`, { method: 'DELETE' });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}

export async function restoreVpsSnapshotAction(id: string, snapshotId: string): Promise<Result<{ actionId: string }>> {
  try {
    const data = await apiFetch<{ actionId: string }>(`/vps/${id}/snapshots/${snapshotId}/restore`, { method: 'POST' });
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}

export async function fetchVpsOsImages(id: string): Promise<Result<VpsOsImageDto[]>> {
  try {
    return { ok: true, data: await apiFetch<VpsOsImageDto[]>(`/vps/${id}/images`) };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}

export async function rebuildVpsAction(
  id: string,
  image: string,
): Promise<Result<{ actionId: string; rootPassword: string | null }>> {
  try {
    const data = await apiFetch<{ actionId: string; rootPassword: string | null }>(`/vps/${id}/rebuild`, {
      method: 'POST',
      body: JSON.stringify({ image }),
    });
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}

export async function vpsActionStatus(
  id: string,
  actionId: string,
): Promise<Result<{ status: 'running' | 'success' | 'error'; progress: number }>> {
  try {
    return { ok: true, data: await apiFetch(`/vps/${id}/actions/${actionId}`) };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}

/** Jednorazowa sesja konsoli — hasło tylko dla tego połączenia, nigdzie nie zapisywane. */
export async function requestVpsConsoleAction(id: string): Promise<Result<{ wssUrl: string; password: string }>> {
  try {
    return { ok: true, data: await apiFetch(`/vps/${id}/console`, { method: 'POST' }) };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}
