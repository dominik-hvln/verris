import type {
  PlanDto,
  ServiceDetailsDto,
  ServiceSummaryDto,
} from '@verris/contracts/klient';
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
  /** Promocja przy pierwszym zakupie (kredyty na autoskalowanie) włączona. */
  cardEnabled: boolean;
  /** Decyzja 6.11.2026 — kredyty na autoskalowanie przy pierwszym zakupie planu rocznego (zł brutto). */
  annualAutoscalingCredit: number;
  /** Jak wyżej, plan miesięczny. */
  monthlyAutoscalingCredit: number;
  /** Ważność kredytów od przyznania (miesiące). */
  autoscalingCreditValidityMonths?: number;
}

/**
 * Kredyty na autoskalowanie tylko przy pierwszym zakupie klienta (warunek jak dawny rabat na start, 14.10).
 * Błąd API = bez obietnicy w panelu (API i tak liczy samo).
 */
export async function czyKredytyStartowe(): Promise<boolean> {
  try {
    return (await apiFetch<{ przysluguje: boolean }>('/subscriptions/kredyty-startowe')).przysluguje === true;
  } catch {
    return false;
  }
}

/** UX-3 — oferta na start (chooser zamawiania). Fallback bezpieczny: bez obietnicy kredytów. */
export async function getTrialOffer(): Promise<TrialOffer> {
  try {
    return await apiFetch<TrialOffer>('/platform-settings/trial-offer');
  } catch {
    return {
      freeEnabled: true,
      cardEnabled: false,
      annualAutoscalingCredit: 0,
      monthlyAutoscalingCredit: 0,
    };
  }
}
