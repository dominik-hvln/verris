'use server';

import { apiFetch, ApiError } from '@/lib/api';

export interface PasskeyDto {
  id: string;
  name: string | null;
  deviceType: string | null;
  backedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

interface ActionError {
  ok: false;
  error: string;
}

export async function getPasskeysAvailable(): Promise<boolean> {
  try {
    const res = await apiFetch<{ available: boolean }>('/auth/webauthn/status', {
      unauthenticated: true,
    });
    return res.available;
  } catch {
    return false;
  }
}

export async function listPasskeys(): Promise<PasskeyDto[]> {
  try {
    return await apiFetch<PasskeyDto[]>('/auth/webauthn/credentials');
  } catch {
    return [];
  }
}

/** Returns the WebAuthn registration options (PublicKeyCredentialCreationOptionsJSON). */
export async function getPasskeyRegisterOptions(): Promise<
  { ok: true; options: unknown } | ActionError
> {
  try {
    const options = await apiFetch<unknown>('/auth/webauthn/register/options', {
      method: 'POST',
    });
    return { ok: true, options };
  } catch (err) {
    return { ok: false, error: err instanceof ApiError ? err.message : 'Błąd' };
  }
}

export async function verifyPasskeyRegistration(
  response: unknown,
  deviceName?: string,
): Promise<{ ok: true } | ActionError> {
  try {
    await apiFetch('/auth/webauthn/register/verify', {
      method: 'POST',
      body: JSON.stringify({ response, deviceName }),
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof ApiError ? err.message : 'Błąd weryfikacji' };
  }
}

export async function deletePasskey(id: string): Promise<{ ok: true } | ActionError> {
  try {
    await apiFetch(`/auth/webauthn/credentials/${id}/delete`, { method: 'POST' });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof ApiError ? err.message : 'Błąd usuwania' };
  }
}
