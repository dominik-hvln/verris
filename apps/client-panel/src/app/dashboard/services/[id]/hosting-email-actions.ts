'use server';

import { revalidatePath } from 'next/cache';
import type { HostingEmailAccountsResponseDto } from '@verris/contracts';
import { apiFetch, ApiError } from '@/lib/api';

export async function fetchHostingEmailAction(
  subscriptionId: string,
): Promise<HostingEmailAccountsResponseDto> {
  return apiFetch<HostingEmailAccountsResponseDto>(`/services/${subscriptionId}/hosting-email`);
}

type EmailActionResult = { ok: true } | { ok: false; error: string };

function errMsg(err: unknown): string {
  return err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Błąd';
}

/** P-1 — create a mailbox on the hosting account's domain. */
export async function createHostingEmailAction(input: {
  subscriptionId: string;
  email: string;
  password: string;
  quotaMb?: number;
}): Promise<EmailActionResult> {
  try {
    await apiFetch(`/services/${input.subscriptionId}/hosting-email`, {
      method: 'POST',
      body: JSON.stringify({
        email: input.email,
        password: input.password,
        quotaMb: input.quotaMb,
      }),
    });
    revalidatePath('/dashboard/email');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errMsg(err) };
  }
}

/** Zmiana hasła istniejącej skrzynki (DA action=modify, quota zachowana po stronie API). */
export async function changeHostingEmailPasswordAction(input: {
  subscriptionId: string;
  email: string;
  password: string;
}): Promise<EmailActionResult> {
  try {
    await apiFetch(`/services/${input.subscriptionId}/hosting-email/password`, {
      method: 'POST',
      body: JSON.stringify({ email: input.email, password: input.password }),
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errMsg(err) };
  }
}

/** P-1 — delete a mailbox. */
export async function deleteHostingEmailAction(
  subscriptionId: string,
  email: string,
): Promise<EmailActionResult> {
  try {
    await apiFetch(`/services/${subscriptionId}/hosting-email/${encodeURIComponent(email)}`, {
      method: 'DELETE',
    });
    revalidatePath('/dashboard/email');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errMsg(err) };
  }
}

/* ===================== PANEL-1: forwardery (aliasy) ===================== */
export type ForwarderRow = { id: string; name: string; email: string; destinations: string[] };
export async function fetchHostingForwardersAction(
  subscriptionId: string,
): Promise<{ rows: ForwarderRow[]; fetchError: string | null }> {
  return apiFetch(`/services/${subscriptionId}/hosting-email-forwarders`);
}

export async function createHostingForwarderAction(input: {
  subscriptionId: string;
  name: string;
  destinations: string;
}): Promise<EmailActionResult> {
  try {
    await apiFetch(`/services/${input.subscriptionId}/hosting-email-forwarders`, {
      method: 'POST',
      body: JSON.stringify({ name: input.name, destinations: input.destinations }),
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errMsg(err) };
  }
}

export async function deleteHostingForwarderAction(
  subscriptionId: string,
  name: string,
): Promise<EmailActionResult> {
  try {
    await apiFetch(`/services/${subscriptionId}/hosting-email-forwarders/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errMsg(err) };
  }
}

/* ===================== PANEL-1: autorespondery ===================== */
export type AutoresponderRow = { id: string; name: string; email: string; cc: string };
export async function fetchHostingAutorespondersAction(
  subscriptionId: string,
): Promise<{ rows: AutoresponderRow[]; fetchError: string | null }> {
  return apiFetch(`/services/${subscriptionId}/hosting-autoresponders`);
}

export async function setHostingAutoresponderAction(input: {
  subscriptionId: string;
  name: string;
  text: string;
  cc?: string;
}): Promise<EmailActionResult> {
  try {
    await apiFetch(`/services/${input.subscriptionId}/hosting-autoresponders`, {
      method: 'POST',
      body: JSON.stringify({ name: input.name, text: input.text, cc: input.cc }),
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errMsg(err) };
  }
}

export async function deleteHostingAutoresponderAction(
  subscriptionId: string,
  name: string,
): Promise<EmailActionResult> {
  try {
    await apiFetch(`/services/${subscriptionId}/hosting-autoresponders/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errMsg(err) };
  }
}

/* ===================== PANEL-8: catch-all ===================== */
export type CatchAllState = { value: string; mode: 'fail' | 'blackhole' | 'address'; address: string; fetchError: string | null };
export async function fetchCatchAllAction(subscriptionId: string): Promise<CatchAllState> {
  return apiFetch(`/services/${subscriptionId}/hosting-catchall`);
}
export async function setCatchAllAction(input: { subscriptionId: string; mode: 'fail' | 'blackhole' | 'address'; address?: string }): Promise<EmailActionResult> {
  try {
    await apiFetch(`/services/${input.subscriptionId}/hosting-catchall`, {
      method: 'POST',
      body: JSON.stringify({ mode: input.mode, address: input.address }),
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errMsg(err) };
  }
}

/* ===================== PANEL-9: filtr antyspam ===================== */
export type SpamFilterState = { isOn: boolean; requiredScore: string; subjectTag: string; fetchError: string | null };
export async function fetchSpamFilterAction(subscriptionId: string): Promise<SpamFilterState> {
  return apiFetch(`/services/${subscriptionId}/hosting-spamfilter`);
}
export async function setSpamFilterAction(input: { subscriptionId: string; enabled: boolean; requiredScore?: string; subjectTag?: string }): Promise<EmailActionResult> {
  try {
    await apiFetch(`/services/${input.subscriptionId}/hosting-spamfilter`, {
      method: 'POST',
      body: JSON.stringify({ enabled: input.enabled, requiredScore: input.requiredScore, subjectTag: input.subjectTag }),
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errMsg(err) };
  }
}
