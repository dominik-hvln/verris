'use server';

import { bezpiecznie, type Wynik as WynikAkcji } from '@/lib/wynik-akcji';

import type { HostingLogDto } from '@verris/contracts';
import { apiFetch } from '@/lib/api';

/** K-04/K-05 — ostatnie linie logu dostępu albo błędów domeny. */
async function fetchHostingLogActionTresc(
  subscriptionId: string,
  q: { type: 'access' | 'error'; domain?: string; lines: number },
): Promise<HostingLogDto> {
  const p = new URLSearchParams({ type: q.type, lines: String(q.lines) });
  if (q.domain) p.set('domain', q.domain);
  return apiFetch<HostingLogDto>(`/services/${subscriptionId}/hosting-logs?${p.toString()}`);
}

export async function fetchHostingLogAction(...a: Parameters<typeof fetchHostingLogActionTresc>): Promise<WynikAkcji<Awaited<ReturnType<typeof fetchHostingLogActionTresc>>>> {
  return bezpiecznie(() => fetchHostingLogActionTresc(...a));
}
