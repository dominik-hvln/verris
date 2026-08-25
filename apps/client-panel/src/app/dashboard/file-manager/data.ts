'use server';

import { cookies } from 'next/headers';
import type { ServiceSummaryDto } from '@verris/contracts';
import { apiFetch } from '@/lib/api';

// Ten moduł jest `'use server'` i sam woła `fetch` (upload/download plików),
// więc potrzebuje adresu WEWNĘTRZNEGO, nie publicznego — powód opisany
// w apps/client-panel/src/lib/api.ts (X-37).
const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export interface FmEntry {
  name: string;
  type: 'dir' | 'file';
  sizeBytes: number;
  modified: string | null;
}

export interface FmHostingService {
  id: string;
  domain: string;
}

async function authHeader(): Promise<Record<string, string>> {
  const token = (await cookies()).get('auth_token')?.value;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Hosting services that actually have a live account to browse. */
export async function listHostingServices(): Promise<FmHostingService[]> {
  const services = await apiFetch<ServiceSummaryDto[]>('/services');
  return services
    .filter(
      (s) => s.productKind === 'HOSTING' && s.account && s.account.status === 'ACTIVE',
    )
    .map((s) => ({ id: s.id, domain: s.account!.domain }));
}

export async function fmList(
  id: string,
  path: string,
): Promise<{ path: string; entries: FmEntry[] }> {
  return apiFetch(`/services/${id}/files?path=${encodeURIComponent(path)}`);
}

export async function fmRead(
  id: string,
  path: string,
): Promise<{ path: string; content: string }> {
  return apiFetch(`/services/${id}/files/read?path=${encodeURIComponent(path)}`);
}

export async function fmWrite(
  id: string,
  dir: string,
  filename: string,
  content: string,
): Promise<{ ok: true }> {
  return apiFetch(`/services/${id}/files/write`, {
    method: 'POST',
    body: JSON.stringify({ dir, filename, content }),
  });
}

export async function fmMkdir(id: string, dir: string, name: string): Promise<{ ok: true }> {
  return apiFetch(`/services/${id}/files/mkdir`, {
    method: 'POST',
    body: JSON.stringify({ dir, name }),
  });
}

export async function fmRename(
  id: string,
  dir: string,
  oldName: string,
  newName: string,
): Promise<{ ok: true }> {
  return apiFetch(`/services/${id}/files/rename`, {
    method: 'POST',
    body: JSON.stringify({ dir, oldName, newName }),
  });
}

export async function fmDelete(
  id: string,
  dir: string,
  names: string[],
): Promise<{ ok: true; deleted: number }> {
  return apiFetch(`/services/${id}/files/delete`, {
    method: 'POST',
    body: JSON.stringify({ dir, names }),
  });
}

export async function fmCopy(
  id: string,
  dir: string,
  names: string[],
  dest: string,
): Promise<{ ok: true; count: number }> {
  return apiFetch(`/services/${id}/files/copy`, {
    method: 'POST',
    body: JSON.stringify({ dir, names, dest }),
  });
}

export async function fmMove(
  id: string,
  dir: string,
  names: string[],
  dest: string,
): Promise<{ ok: true; count: number }> {
  return apiFetch(`/services/${id}/files/move`, {
    method: 'POST',
    body: JSON.stringify({ dir, names, dest }),
  });
}

export async function fmExtract(
  id: string,
  path: string,
  dest?: string,
): Promise<{ ok: true }> {
  return apiFetch(`/services/${id}/files/extract`, {
    method: 'POST',
    body: JSON.stringify({ path, dest }),
  });
}

export async function fmChmod(
  id: string,
  dir: string,
  names: string[],
  mode: string,
): Promise<{ ok: true; count: number }> {
  return apiFetch(`/services/${id}/files/chmod`, {
    method: 'POST',
    body: JSON.stringify({ dir, names, mode }),
  });
}

/** Upload — manual multipart forward (apiFetch can't carry FormData cleanly). */
export async function fmUpload(form: FormData): Promise<{ ok: true } | { error: string }> {
  const id = String(form.get('id') ?? '');
  const dir = String(form.get('dir') ?? '/');
  const file = form.get('file');
  if (!id || !(file instanceof File)) return { error: 'Brak pliku.' };

  const out = new FormData();
  out.append('dir', dir);
  out.append('file', file, file.name);

  const res = await fetch(`${API_URL}/services/${id}/files/upload`, {
    method: 'POST',
    headers: await authHeader(),
    body: out,
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    return { error: (body && (body.message?.message ?? body.message)) || `Błąd ${res.status}` };
  }
  return { ok: true };
}

/** Download — fetch bytes server-side, return base64 for the browser to save. */
export async function fmDownload(
  id: string,
  path: string,
): Promise<{ filename: string; base64: string } | { error: string }> {
  const res = await fetch(
    `${API_URL}/services/${id}/files/download?path=${encodeURIComponent(path)}`,
    { headers: await authHeader(), cache: 'no-store' },
  );
  if (!res.ok) return { error: `Nie udało się pobrać pliku (${res.status}).` };
  const buf = Buffer.from(await res.arrayBuffer());
  return { filename: path.split('/').pop() || 'plik', base64: buf.toString('base64') };
}
