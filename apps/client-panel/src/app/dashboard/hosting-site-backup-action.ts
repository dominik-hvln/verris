'use server';

import { apiFetch } from '@/lib/api';
import { revalidatePath } from 'next/cache';

export async function requestHostingSiteBackupAction(
  serviceId: string,
): Promise<{ ok: true } | { error: string }> {
  try {
    await apiFetch(`/services/${serviceId}/hosting-site-backup`, { method: 'POST' });
    revalidatePath('/dashboard/backups');
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Nie udało się zlecić kopii zapasowej.' };
  }
}
