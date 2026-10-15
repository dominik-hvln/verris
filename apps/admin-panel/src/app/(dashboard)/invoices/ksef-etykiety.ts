/** Stan faktury w KSeF (enum KsefStatus w API) — etykiety wspólne dla listy faktur (F3.6) i strony faktury. */
export const KSEF: Record<string, { t: string; ton: "ok" | "warn" | "crit" | "muted" }> = {
  NOT_APPLICABLE: { t: "nie dotyczy", ton: "muted" },
  PENDING: { t: "czeka na wysyłkę", ton: "warn" },
  SUBMITTED: { t: "wysłana, czeka na numer", ton: "warn" },
  ACCEPTED: { t: "przyjęta", ton: "ok" },
  REJECTED: { t: "odrzucona", ton: "crit" },
  OFFLINE: { t: "offline — do dosłania", ton: "warn" },
  UNCERTAIN: { t: "do wyjaśnienia — KSeF nie potwierdził wysyłki", ton: "crit" },
};

export const stanKsef = (s: string) => KSEF[s] ?? { t: s, ton: "muted" as const };
