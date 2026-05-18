'use server';

import type { DomainDto, ServiceSummaryDto } from '@verris/contracts';
import { ApiError, apiFetch } from '@/lib/api';

export type DashboardFetchResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };

function describeApiError(err: unknown): { message: string; status?: number } {
  if (err instanceof ApiError) {
    return { message: err.message, status: err.status };
  }
  if (err instanceof Error) {
    return { message: err.message };
  }
  return { message: 'Nie udało się pobrać danych z API' };
}

export async function fetchUserServicesSummary(): Promise<
  DashboardFetchResult<ServiceSummaryDto[]>
> {
  try {
    const data = await apiFetch<ServiceSummaryDto[]>('/services');
    return { ok: true, data };
  } catch (err) {
    const { message, status } = describeApiError(err);
    return { ok: false, error: message, status };
  }
}

export async function fetchUserDomainsPortfolio(): Promise<
  DashboardFetchResult<DomainDto[]>
> {
  try {
    const data = await apiFetch<DomainDto[]>('/domains');
    return { ok: true, data };
  } catch (err) {
    const { message, status } = describeApiError(err);
    return { ok: false, error: message, status };
  }
}
