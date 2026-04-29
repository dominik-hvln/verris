'use server';

import { revalidatePath } from 'next/cache';
import { adminApi } from '@/lib/api';

export async function requestInternalMigrationAction(input: {
  subscriptionId: string;
  targetServerId: string;
  notes?: string;
}): Promise<{ ok: true } | { error: string }> {
  try {
    await adminApi(`/admin/subscriptions/${input.subscriptionId}/internal-migration`, {
      method: 'POST',
      body: {
        targetServerId: input.targetServerId,
        notes: input.notes ?? undefined,
      },
    });
    revalidatePath(`/subscriptions/${input.subscriptionId}`);
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Nie udało się zlecić migracji wewnętrznej.' };
  }
}

