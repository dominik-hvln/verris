'use server';

import { revalidatePath } from 'next/cache';
import { staffApi } from '@/lib/staff-api';

export async function decyzjaAction(input: {
  id: string;
  status: 'IN_REVIEW' | 'ACTION_TAKEN' | 'REJECTED';
  decision?: string;
  notifyCustomer?: boolean;
}): Promise<{ ok: true } | { error: string }> {
  try {
    await staffApi(`/staff/abuse/${input.id}/decision`, {
      method: 'POST',
      body: { status: input.status, decision: input.decision || undefined, notifyCustomer: input.notifyCustomer ?? false },
    });
    revalidatePath('/abuse');
    revalidatePath(`/abuse/${input.id}`);
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Nie udało się zapisać decyzji.' };
  }
}
