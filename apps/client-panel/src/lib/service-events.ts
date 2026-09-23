import { SERVICE_EVENT_PL } from '@verris/contracts';

/** Zdarzenia usługi po polsku — źródło w `@verris/contracts` (wspólne z panelem obsługi). */
export const EVENT_LABEL = SERVICE_EVENT_PL;
export const EVENT_WARN = new Set(['PAYMENT_FAILED', 'SUSPENDED', 'PROVISIONING_FAILED', 'TRIAL_EXPIRED', 'CANCEL_SCHEDULED']);


export function serviceEventLabel(type: string): string {
  return EVENT_LABEL[type] ?? type.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());
}
