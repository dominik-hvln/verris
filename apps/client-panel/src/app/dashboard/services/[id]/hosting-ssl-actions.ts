'use server';

import type { HostingSslMutationOkDto, HostingSslResponseDto, SslPlatneDto, SslZamowienieDto, SslZamowRequestDto } from '@verris/contracts';
import { apiFetch, ApiError } from '@/lib/api';
import { bezpiecznie, type Wynik } from '@/lib/wynik-akcji';

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
  wildcard = false,
): Promise<HostingSslActionResult> {
  try {
    await apiFetch<HostingSslMutationOkDto>(`/services/${serviceId}/hosting-ssl/letsencrypt`, {
      method: 'POST',
      body: JSON.stringify({ domain, includeWww, wildcard }),
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

/** G-08 — płatne certyfikaty: oferta z cennika i zamówienia tej usługi. */
export async function fetchPaidSslAction(serviceId: string): Promise<Wynik<SslPlatneDto>> {
  return bezpiecznie(() => apiFetch<SslPlatneDto>(`/services/${serviceId}/ssl-orders`));
}

export async function orderPaidSslAction(serviceId: string, input: SslZamowRequestDto): Promise<Wynik<SslZamowienieDto>> {
  return bezpiecznie(() =>
    apiFetch<SslZamowienieDto>(`/services/${serviceId}/ssl-orders`, { method: 'POST', body: JSON.stringify(input) }),
  );
}

export async function checkPaidSslAction(serviceId: string, orderId: string): Promise<Wynik<SslZamowienieDto>> {
  return bezpiecznie(() =>
    apiFetch<SslZamowienieDto>(`/services/${serviceId}/ssl-orders/${orderId}/check`, { method: 'POST' }),
  );
}
