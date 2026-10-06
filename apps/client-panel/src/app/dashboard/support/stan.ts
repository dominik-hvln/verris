export type TonStanu = "data" | "warn" | "muted";

/** Stan zgłoszenia dla klienta — jeden słownik w panelu (ten sam ma API w mailach: `STAN_ZGLOSZENIA_KLIENT`). */
const STAN: Record<string, { label: string; tone: TonStanu }> = {
  OPEN: { label: "Przyjęte", tone: "data" },
  IN_PROGRESS: { label: "W toku", tone: "data" },
  WAITING_CUSTOMER: { label: "Czekamy na Ciebie", tone: "warn" },
  CLOSED: { label: "Rozwiązane", tone: "muted" },
};

export function stanZgloszenia(status: string): { label: string; tone: TonStanu } {
  return STAN[status] ?? { label: status, tone: "muted" };
}
