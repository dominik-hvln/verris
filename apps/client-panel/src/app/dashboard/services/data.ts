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

export interface TrialOffer {
  freeEnabled: boolean;
  cardEnabled: boolean;
  annualDiscountPct: number;
  monthlyDiscountPct: number;
  annualPromoCode: string;
  monthlyPromoCode: string;
}

/** UX-3 — oferta okresu próbnego (chooser zamawiania). Fallback bezpieczny. */
export async function getTrialOffer(): Promise<TrialOffer> {
  try {
    return await apiFetch<TrialOffer>('/platform-settings/trial-offer');
  } catch {
    return {
      freeEnabled: true,
      cardEnabled: false,
      annualDiscountPct: 15,
      monthlyDiscountPct: 10,
      annualPromoCode: '',
      monthlyPromoCode: '',
    };
  }
}
