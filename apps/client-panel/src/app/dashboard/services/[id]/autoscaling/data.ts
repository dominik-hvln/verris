import { apiFetch, ApiError } from '@/lib/api';

export interface AutoscalingEventDto {
  id: string;
  type: string;
  resource: string | null;
  fromValue: number | null;
  toValue: number | null;
  costAccrued: string;
  reason: string | null;
  createdAt: string;
}

export interface AutoscalingChargeDto {
  id: string;
  amount: string;
  description: string | null;
  createdAt: string;
}

export interface AutoscalingHistoryDto {
  subscription: {
    id: string;
    autoscalingEnabled: boolean;
    autoscalingMaxCost: string;
    autoscalingDisabledReason: string | null;
  };
  events: AutoscalingEventDto[];
  charges: AutoscalingChargeDto[];
  last30dSpend: string;
  currency: string;
}

export interface ServiceDetailDto {
  id: string;
  status: string;
  priceAmount: string;
  currency: string;
  interval: 'MONTH' | 'YEAR';
  autoscalingEnabled: boolean;
  autoscalingMaxCost: string;
  autoscalingScaleCpu?: boolean;
  autoscalingScaleRam?: boolean;
  autoscalingScaleDisk?: boolean;
  ecoModeEnabled: boolean;
  account: {
    id: string;
    daUsername: string;
    domain: string;
    status: string;
    serverId: string;
    cpuLimit: number;
    ramLimitMb: number;
    diskLimitMb: number;
    scaledCpu: number;
    scaledRamMb: number;
    scaledDiskMb: number;
  } | null;
  plan: {
    id: string;
    slug: string;
    name: string;
    cpuLimit: number;
    ramLimitMb: number;
    diskLimitMb: number;
  };
}

export async function getServiceDetails(id: string) {
  try {
    const data = await apiFetch<ServiceDetailDto>(`/subscriptions/${id}`);
    return { ok: true as const, data };
  } catch (err) {
    return { ok: false as const, error: errorMessage(err) };
  }
}

export async function getAutoscalingHistory(subscriptionId: string) {
  try {
    const data = await apiFetch<AutoscalingHistoryDto>(
      `/subscriptions/${subscriptionId}/autoscaling/history`,
    );
    return { ok: true as const, data };
  } catch (err) {
    return { ok: false as const, error: errorMessage(err) };
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Unknown error';
}

export async function getUserEcoPoints() {
  try {
    const me = await apiFetch<{ ecoPoints?: number }>('/users/me');
    return typeof me.ecoPoints === 'number' ? me.ecoPoints : 0;
  } catch {
    return 0;
  }
}

export interface EcoReportDto {
  periodDays: number;
  samples: number;
  cpuCoreHours: number;
  avgRamGb: number;
  energyKwh: number;
  co2Kg: number;
  baselineEnergyKwh: number;
  savedEnergyKwh: number;
  savedCo2Kg: number;
  treeMonthsEquivalent: number;
  ecoModeEnabled: boolean;
  methodology: string;
}

export async function getEcoReport(serviceId: string): Promise<EcoReportDto | null> {
  try {
    return await apiFetch<EcoReportDto>(`/services/${serviceId}/eco-report`);
  } catch {
    return null;
  }
}
