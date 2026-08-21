export type AutoscalingResource = 'CPU' | 'RAM' | 'DISK';

export interface PriceRuleDto {
  id: string;
  resource: AutoscalingResource;
  unit: string;
  pricePerUnit: string;
  currency: string;
  thresholdAbove: number;
  isActive: boolean;
}
