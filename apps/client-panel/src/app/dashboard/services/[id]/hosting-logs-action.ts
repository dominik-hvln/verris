'use server';

import type { HostingLogDto } from '@verris/contracts';
import { apiFetch } from '@/lib/api';

/** K-04/K-05 — ostatnie linie logu dostępu albo błędów domeny. */
export async function fetchHostingLogAction(
  subscriptionId: string,
  q: { type: 'access' | 'error'; domain?: string; lines: number },
): Promise<HostingLogDto> {
  const p = new URLSearchParams({ type: q.type, lines: String(q.lines) });
  if (q.domain) p.set('domain', q.domain);
  return apiFetch<HostingLogDto>(`/services/${subscriptionId}/hosting-logs?${p.toString()}`);
}
