'use server';

import type { DomainDto, ServiceSummaryDto } from '@verris/contracts';
import { apiFetch } from '@/lib/api';

export async function fetchUserServicesSummary(): Promise<ServiceSummaryDto[]> {
  try {
    return await apiFetch<ServiceSummaryDto[]>('/services');
  } catch {
    return [];
  }
}

export async function fetchUserDomainsPortfolio(): Promise<DomainDto[]> {
  try {
    return await apiFetch<DomainDto[]>('/domains');
  } catch {
    return [];
  }
}
