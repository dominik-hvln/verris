export type AutoscalingResource = 'CPU' | 'RAM' | 'IO' | 'TRANSFER';

export interface PriceRuleDto {
  id: string;
  resource: AutoscalingResource;
  unit: string;
  pricePerUnit: string;
  currency: string;
  thresholdAbove: number;
  isActive: boolean;
  notes: string | null;
}
