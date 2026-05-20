import type { BillingInterval } from './subscription.dto';

export type PlanChangeDirection = 'none' | 'upgrade' | 'downgrade';

export interface PlanChangeTargetPlanDto {
  id: string;
  slug: string;
  name: string;
  cpuLimit: number;
  ramLimitMb: number;
  diskLimitMb: number;
  priceForInterval: string;
  priceMonthly: string;
  priceYearly: string;
  currency: string;
}

export interface PlanChangePreviewDto {
  subscriptionId: string;
  currentPlanId: string;
  currentPlanName: string;
  interval: BillingInterval;
  targetInterval: BillingInterval;
  intervalChange: boolean;
  paymentSource: 'STRIPE_CARD' | 'WALLET' | 'MANUAL';
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  newPeriodStart: string | null;
  newPeriodEnd: string | null;
  remainingFraction: number;
  direction: PlanChangeDirection;
  amountDue: string;
  amountCredit: string;
  currency: string;
  resetsAutoscalingDeltas: boolean;
  peakDiskUsageMb: number | null;
  targetPlans: PlanChangeTargetPlanDto[];
}

export interface PlanChangeResultDto {
  subscriptionId: string;
  fromPlanId: string;
  toPlanId: string;
  fromInterval: BillingInterval;
  toInterval: BillingInterval;
  direction: PlanChangeDirection;
  amountDue: string;
  amountCredit: string;
  currency: string;
  walletTransactionId: string | null;
}
