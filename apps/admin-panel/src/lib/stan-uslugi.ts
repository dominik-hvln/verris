/** Stan usługi w panelu admina — jedna mapa zamiast czterech kopii. */
export type TonStanu = "ok" | "warn" | "crit" | "muted";

export const STAN_USLUGI: Record<string, { t: string; ton: TonStanu }> = {
  ACTIVE: { t: "działa", ton: "ok" },
  PROVISIONING: { t: "zakładanie", ton: "warn" },
  PENDING_PAYMENT: { t: "czeka na płatność", ton: "warn" },
  PAST_DUE: { t: "zaległa płatność", ton: "warn" },
  SUSPENDED: { t: "zawieszona", ton: "crit" },
  CANCELED: { t: "anulowana", ton: "muted" },
  EXPIRED: { t: "wygasła", ton: "muted" },
};

/**
 * Zadanie zakładania skończone twardą porażką zostawia status PROVISIONING (przy portfelu idzie zwrot
 * i PENDING_PAYMENT, przy zakładaniu ręcznym/Stripe nie) — a etap provisioningStage = „failed”.
 * t1 03.10 (Z-18): usługa po nieudanym zakładaniu wisiała jako „zakładanie”, jakby jeszcze trwało.
 */
export function stanUslugi(status: string, provisioningStage?: string | null): { t: string; ton: TonStanu } {
  if (status === "PROVISIONING" && provisioningStage === "failed") return { t: "zakładanie nieudane", ton: "crit" };
  return STAN_USLUGI[status] ?? { t: status, ton: "muted" };
}
