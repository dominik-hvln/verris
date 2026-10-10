'use server';

import { revalidatePath } from 'next/cache';
import { staffApi } from '@/lib/staff-api';

export async function decyzjaAction(input: {
  id: string;
  status: 'IN_REVIEW' | 'ACTION_TAKEN' | 'REJECTED';
  decision?: string;
  notifyCustomer?: boolean;
  /** F2.3 — zawieś dopasowaną usługę razem z decyzją „Podjęto działania”. */
  suspendService?: boolean;
  /** F3.1 — zablokuj wysyłkę poczty dopasowanej usługi razem z decyzją „Podjęto działania”. */
  blockSending?: boolean;
}): Promise<{ ok: true } | { error: string }> {
  try {
    await staffApi(`/staff/abuse/${input.id}/decision`, {
      method: 'POST',
      body: {
        status: input.status,
        decision: input.decision || undefined,
        notifyCustomer: input.notifyCustomer ?? false,
        ...(input.suspendService ? { suspendService: true } : {}),
        ...(input.blockSending ? { blockSending: true } : {}),
      },
    });
    revalidatePath('/abuse');
    revalidatePath(`/abuse/${input.id}`);
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Nie udało się zapisać decyzji.' };
  }
}
