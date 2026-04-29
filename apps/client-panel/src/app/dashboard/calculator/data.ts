import { apiFetch, ApiError } from '@/lib/api';
import type { PriceRuleDto } from './types';

export async function listAutoscalingPricing(): Promise<{
  ok: true;
  rules: PriceRuleDto[];
}
| { ok: false; error: string }> {
  try {
    const rules = await apiFetch<PriceRuleDto[]>('/autoscaling/pricing', {
      unauthenticated: true,
    });
    return { ok: true, rules };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message };
    if (err instanceof Error) return { ok: false, error: err.message };
    return { ok: false, error: 'Unknown error' };
  }
}
