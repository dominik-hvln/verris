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
  currency: string;
}

export interface PlanChangePreviewDto {
  subscriptionId: string;
  currentPlanId: string;
  currentPlanName: string;
  interval: BillingInterval;
  paymentSource: 'STRIPE_CARD' | 'WALLET' | 'MANUAL';
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  remainingFraction: number;
  direction: PlanChangeDirection;
  amountDue: string;
  amountCredit: string;
  currency: string;
  resetsAutoscalingDeltas: boolean;
  targetPlans: PlanChangeTargetPlanDto[];
}

export interface PlanChangeResultDto {
  subscriptionId: string;
  fromPlanId: string;
  toPlanId: string;
  direction: PlanChangeDirection;
  amountDue: string;
  amountCredit: string;
  currency: string;
  walletTransactionId: string | null;
}
