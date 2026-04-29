'use server';

import { apiFetch } from '@/lib/api';
import { revalidatePath } from 'next/cache';

export async function requestExternalMigrationAction(input: {
  serviceId: string;
  sourceType: 'FTP' | 'MYSQL' | 'IMAP';
  sourceHost: string;
  sourcePort: number;
  sourceUsername: string;
  sourcePassword: string;
  sourcePath?: string;
  notes?: string;
}): Promise<{ ok: true } | { error: string }> {
  try {
    await apiFetch(`/services/${input.serviceId}/migrations/external`, {
      method: 'POST',
      body: JSON.stringify({
        sourceType: input.sourceType,
        sourceHost: input.sourceHost,
        sourcePort: input.sourcePort,
        sourceUsername: input.sourceUsername,
        sourcePassword: input.sourcePassword,
        sourcePath: input.sourcePath ?? undefined,
        notes: input.notes ?? undefined,
      }),
    });
    revalidatePath('/dashboard/migrations');
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Nie udało się wysłać zgłoszenia migracji.' };
  }
}

