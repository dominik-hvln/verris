import type {
  PlanDto,
  ServiceDetailsDto,
  ServiceSummaryDto,
} from '@verris/contracts';
import { apiFetch } from '@/lib/api';

export async function listServices(): Promise<ServiceSummaryDto[]> {
  return apiFetch<ServiceSummaryDto[]>('/services');
}

export async function getServiceDetails(id: string): Promise<ServiceDetailsDto> {
  return apiFetch<ServiceDetailsDto>(`/services/${id}`);
}

export async function listPublicPlans(): Promise<PlanDto[]> {
  return apiFetch<PlanDto[]>('/plans', { unauthenticated: true });
}
