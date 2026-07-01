'use server';

import { apiFetch, ApiError } from '@/lib/api';

export type AnalyticsSite = {
  id: string;
  domain: string;
  siteKey: string;
  enabled: boolean;
  createdAt: string;
};
export type AnalyticsStats = {
  range: { from: string; to: string; days: number };
  totals: { pageviews: number; visitors: number };
  timeseries: Array<{ date: string; pageviews: number; visitors: number }>;
  topPages: Array<{ path: string; count: number }>;
  topReferrers: Array<{ refHost: string; count: number }>;
  countries: Array<{ country: string; count: number }>;
  devices: Array<{ deviceType: string; count: number }>;
};

type Res<T> = { ok: true; data: T } | { ok: false; error: string };
function err(e: unknown): string {
  return e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Wystąpił błąd.';
}
async function call<T>(path: string, init?: RequestInit): Promise<Res<T>> {
  try {
    return { ok: true, data: await apiFetch<T>(path, init) };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}

const base = (sub: string) => `/analytics-sites/${sub}`;

export async function fetchSites(sub: string) {
  return call<AnalyticsSite[]>(base(sub));
}
export async function createSite(sub: string, domain: string) {
  return call<AnalyticsSite>(base(sub), { method: 'POST', body: JSON.stringify({ domain }) });
}
export async function setSiteEnabled(sub: string, siteId: string, enabled: boolean) {
  return call<AnalyticsSite>(`${base(sub)}/${siteId}`, { method: 'PATCH', body: JSON.stringify({ enabled }) });
}
export async function deleteSite(sub: string, siteId: string) {
  return call<{ ok: true }>(`${base(sub)}/${siteId}`, { method: 'DELETE' });
}
export async function fetchStats(sub: string, siteId: string, days: number) {
  return call<AnalyticsStats>(`${base(sub)}/${siteId}/stats?days=${days}`);
}
