"use server";

import { adminApi, AdminApiError } from "@/lib/api";

export interface TwoFactorStatus {
  enabled: boolean;
  enrolledAt: string | null;
  pendingEnrollment: boolean;
  recoveryCodesRemaining: number;
}

interface ActionError {
  ok: false;
  error: string;
}

export async function getTwoFactorStatus(): Promise<TwoFactorStatus | null> {
  try {
    return await adminApi<TwoFactorStatus>("/auth/2fa/status");
  } catch {
    return null;
  }
}

export async function enrollTwoFactorAction(): Promise<
  { ok: true; secret: string; otpauthUri: string } | ActionError
> {
  try {
    const res = await adminApi<{ secret: string; otpauthUri: string }>("/auth/2fa/enroll", {
      method: "POST",
    });
    return { ok: true, ...res };
  } catch (err) {
    return { ok: false, error: extract(err) };
  }
}

export async function confirmTwoFactorAction(
  code: string,
): Promise<{ ok: true; recoveryCodes: string[] } | ActionError> {
  try {
    const res = await adminApi<{ recoveryCodes: string[] }>("/auth/2fa/confirm", {
      method: "POST",
      body: { code: code.replace(/\D/g, "") },
    });
    return { ok: true, recoveryCodes: res.recoveryCodes };
  } catch (err) {
    return { ok: false, error: extract(err) };
  }
}

export async function disableTwoFactorAction(opts: {
  password?: string;
  code?: string;
}): Promise<{ ok: true } | ActionError> {
  try {
    await adminApi("/auth/2fa/disable", {
      method: "POST",
      body: {
        password: opts.password?.trim() || undefined,
        code: opts.code?.trim() || undefined,
      },
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: extract(err) };
  }
}

function extract(err: unknown): string {
  if (err instanceof AdminApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Nieznany błąd";
}
