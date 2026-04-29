'use server';

import { apiFetch, ApiError } from '@/lib/api';

export interface TwoFactorStatus {
  enabled: boolean;
  enrolledAt: string | null;
  pendingEnrollment: boolean;
  recoveryCodesRemaining: number;
}

export interface EnrollResult {
  ok: true;
  secret: string;
  otpauthUri: string;
}

export interface ConfirmResult {
  ok: true;
  recoveryCodes: string[];
}

interface ActionError {
  ok: false;
  error: string;
}

export async function getTwoFactorStatus(): Promise<TwoFactorStatus | null> {
  try {
    return await apiFetch<TwoFactorStatus>('/auth/2fa/status');
  } catch {
    return null;
  }
}

export async function enrollTwoFactorAction(): Promise<EnrollResult | ActionError> {
  try {
    const res = await apiFetch<{ secret: string; otpauthUri: string }>(
      '/auth/2fa/enroll',
      { method: 'POST' },
    );
    return { ok: true, ...res };
  } catch (err) {
    return { ok: false, error: extractMessage(err) };
  }
}

export async function confirmTwoFactorAction(
  code: string,
): Promise<ConfirmResult | ActionError> {
  try {
    const res = await apiFetch<{ recoveryCodes: string[] }>('/auth/2fa/confirm', {
      method: 'POST',
      body: JSON.stringify({ code: code.replace(/\D/g, '') }),
    });
    return { ok: true, recoveryCodes: res.recoveryCodes };
  } catch (err) {
    return { ok: false, error: extractMessage(err) };
  }
}

export async function disableTwoFactorAction(opts: {
  password?: string;
  code?: string;
}): Promise<{ ok: true } | ActionError> {
  try {
    await apiFetch('/auth/2fa/disable', {
      method: 'POST',
      body: JSON.stringify({
        password: opts.password?.trim() || undefined,
        code: opts.code?.trim() || undefined,
      }),
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: extractMessage(err) };
  }
}

function extractMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Nieznany błąd';
}
