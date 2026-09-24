'use server';

import { apiFetch, ApiError } from '@/lib/api';

/** L-10 — webhooki klienta. */
export interface WebhooksStan {
  zdarzenia: string[];
  adresy: {
    id: string;
    url: string;
    zdarzenia: string[];
    utworzony: string;
    dostawy: { id: string; zdarzenie: string; status: 'PENDING' | 'SENT' | 'FAILED'; proby: number; kod: number | null; blad: string | null; utworzona: string }[];
  }[];
}

type Wynik<T> = { ok: true; data: T } | { ok: false; error: string };
const blad = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : 'Błąd');

export async function fetchWebhooks(): Promise<Wynik<WebhooksStan>> {
  try {
    return { ok: true, data: await apiFetch<WebhooksStan>('/users/me/webhooks') };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}

export async function createWebhook(url: string, events: string[]): Promise<Wynik<{ id: string; sekret: string }>> {
  try {
    return { ok: true, data: await apiFetch('/users/me/webhooks', { method: 'POST', body: JSON.stringify({ url, events }) }) };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}

export async function deleteWebhook(id: string): Promise<Wynik<{ ok: boolean }>> {
  try {
    return { ok: true, data: await apiFetch(`/users/me/webhooks/${encodeURIComponent(id)}/delete`, { method: 'POST' }) };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}

export async function testWebhook(id: string): Promise<Wynik<{ ok: boolean }>> {
  try {
    return { ok: true, data: await apiFetch(`/users/me/webhooks/${encodeURIComponent(id)}/test`, { method: 'POST' }) };
  } catch (e) {
    return { ok: false, error: blad(e) };
  }
}
