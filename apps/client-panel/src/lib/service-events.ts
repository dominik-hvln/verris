/** Zdarzenia usługi po polsku — wspólne dla przeglądu usługi i historii rozliczeń. */
export const EVENT_LABEL: Record<string, string> = {
  CREATED: 'Usługa zamówiona',
  PROVISIONING_INTENT: 'Zaczęliśmy zakładać konto',
  ACCOUNT_PROVISIONED: 'Konto hostingowe gotowe',
  ACTIVATED: 'Usługa aktywna',
  RENEWED: 'Usługa odnowiona',
  PLAN_CHANGED: 'Zmieniono plan',
  PAYMENT_FAILED: 'Płatność nie przeszła',
  PAYMENT_RECOVERED: 'Płatność uregulowana',
  SUSPENDED: 'Usługa zawieszona',
  UNSUSPENDED: 'Usługa odwieszona',
  CANCEL_SCHEDULED: 'Zaplanowano rezygnację',
  CANCELED: 'Usługa anulowana',
  TRIAL_STARTED: 'Start okresu próbnego',
  TRIAL_CONVERTED: 'Okres próbny zamieniony na płatny',
  TRIAL_EXPIRED: 'Koniec okresu próbnego',
  PROVISIONING_FAILED: 'Zakładanie konta wymaga uwagi',
};
export const EVENT_WARN = new Set(['PAYMENT_FAILED', 'SUSPENDED', 'PROVISIONING_FAILED', 'TRIAL_EXPIRED', 'CANCEL_SCHEDULED']);


export function serviceEventLabel(type: string): string {
  return EVENT_LABEL[type] ?? type.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());
}
