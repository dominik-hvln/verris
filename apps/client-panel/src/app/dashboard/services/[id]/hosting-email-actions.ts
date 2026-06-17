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
