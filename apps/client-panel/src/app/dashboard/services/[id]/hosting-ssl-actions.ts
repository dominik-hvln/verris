'use server';

import type { HostingSslMutationOkDto, HostingSslResponseDto } from '@verris/contracts';
import { apiFetch, ApiError } from '@/lib/api';

export async function fetchHostingSslAction(
  serviceId: string,
): Promise<HostingSslResponseDto | null> {
  try {
    return await apiFetch<HostingSslResponseDto>(`/services/${serviceId}/hosting-ssl`);
  } catch {
    return null;
  }
}

export type HostingSslActionResult =
  | (HostingSslMutationOkDto & { error?: undefined })
  | { ok: false; error: string };

export async function requestLetsEncryptSslAction(
  serviceId: string,
  domain: string,
  includeWww: boolean,
): Promise<HostingSslActionResult> {
  try {
    await apiFetch<HostingSslMutationOkDto>(`/services/${serviceId}/hosting-ssl/letsencrypt`, {
      method: 'POST',
      body: JSON.stringify({ domain, includeWww }),
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message };
    if (err instanceof Error) return { ok: false, error: err.message };
    return { ok: false, error: 'Nie udało się zlecić Let’s Encrypt.' };
  }
}

export async function pasteCustomSslAction(
  serviceId: string,
  input: { domain: string; certificate: string; privateKey: string; caBundle?: string },
): Promise<HostingSslActionResult> {
  try {
    await apiFetch<HostingSslMutationOkDto>(`/services/${serviceId}/hosting-ssl/paste`, {
      method: 'POST',
      body: JSON.stringify({
        domain: input.domain,
        certificate: input.certificate,
        privateKey: input.privateKey,
        ...(input.caBundle?.trim() ? { caBundle: input.caBundle.trim() } : {}),
      }),
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message };
    if (err instanceof Error) return { ok: false, error: err.message };
    return { ok: false, error: 'Nie udało się zapisać certyfikatu.' };
  }
}
