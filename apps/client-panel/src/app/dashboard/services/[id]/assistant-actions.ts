'use server';

import { apiFetch, ApiError } from '@/lib/api';

export interface AssistantHint {
  key: string;
  severity: 'crit' | 'warn';
  title: string;
  detail: string;
  action?:
    | { kind: 'fix'; label: string; preview: { host: string; type: string; value: string; replaces?: { name: string; type: string; value: string } } }
    | { kind: 'tab'; label: string; tab: string }
    | { kind: 'href'; label: string; href: string };
}

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };
const msg = (e: unknown) => (e instanceof ApiError ? e.message : 'Nie udało się — spróbuj ponownie.');

/** PB-17 — dymki asystenta; null = nie udało się pobrać (panel nic wtedy nie pokazuje). */
export async function fetchAssistantHints(serviceId: string): Promise<AssistantHint[] | null> {
  try {
    return await apiFetch<AssistantHint[]>(`/services/${serviceId}/assistant-hints`);
  } catch {
    return null;
  }
}

export async function applyAssistantFix(serviceId: string, key: string): Promise<Result<{ undoId: string }>> {
  try {
    const r = await apiFetch<{ undoId: string }>(`/services/${serviceId}/hosting-dns/assistant-fix`, {
      method: 'POST',
      body: JSON.stringify({ key }),
    });
    return { ok: true, undoId: r.undoId };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}

export async function undoAssistantFix(serviceId: string, undoId: string): Promise<Result<object>> {
  try {
    await apiFetch(`/services/${serviceId}/hosting-dns/assistant-undo`, { method: 'POST', body: JSON.stringify({ undoId }) });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}
