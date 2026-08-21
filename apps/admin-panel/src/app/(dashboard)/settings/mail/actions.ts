'use server';

import { revalidatePath } from 'next/cache';
import { adminApi, AdminApiError } from '@/lib/api';

export type MailSettingsForm = {
  transport: 'local' | 'external';
  fromAddress: string;
  fromName: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: 'none' | 'starttls' | 'tls';
  smtpUser: string;
  smtpPasswordConfigured: boolean;
};

export async function fetchMailSettings(): Promise<MailSettingsForm> {
  return adminApi<MailSettingsForm>('/admin/mail-settings');
}

export async function updateMailSettingsAction(
  _prev: { ok?: boolean; error?: string; testOk?: boolean; testError?: string },
  formData: FormData,
): Promise<{ ok?: boolean; error?: string; testOk?: boolean; testError?: string }> {
  const transport = formData.get('transport') === 'external' ? 'external' : 'local';
  const payload: Record<string, unknown> = {
    transport,
    fromAddress: String(formData.get('fromAddress') ?? ''),
    fromName: String(formData.get('fromName') ?? ''),
  };

  if (transport === 'external') {
    payload.smtpHost = String(formData.get('smtpHost') ?? '');
    payload.smtpPort = Number(formData.get('smtpPort'));
    payload.smtpSecure = String(formData.get('smtpSecure') ?? 'starttls');
    payload.smtpUser = String(formData.get('smtpUser') ?? '');
    const pass = String(formData.get('smtpPassword') ?? '').trim();
    if (pass) payload.smtpPassword = pass;
  }

  try {
    await adminApi('/admin/mail-settings', {
      method: 'PATCH',
      body: payload,
    });
    revalidatePath('/settings/mail');
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof AdminApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : 'Nie udało się zapisać ustawień poczty.',
    };
  }
}

export async function testMailSettingsAction(to?: string): Promise<{
  ok?: boolean;
  error?: string;
  to?: string;
  providerId?: string;
}> {
  try {
    const result = await adminApi<{
      ok: boolean;
      to?: string;
      error?: string;
      providerId?: string;
    }>('/admin/mail-settings/test', {
      method: 'POST',
      body: to?.trim() ? { to: to.trim() } : {},
    });
    if (!result.ok) {
      return {
        ok: false,
        providerId: result.providerId,
        error:
          `Wysyłka nie powiodła się (provider: ${result.providerId ?? '—'}). ` +
          'Zobacz dokładny błąd w EmailLog / logach API.',
      };
    }
    return { ok: true, to: result.to, providerId: result.providerId };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof AdminApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : 'Test wysyłki nie powiódł się.',
    };
  }
}
