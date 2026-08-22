import { listWebhookEvents, type WebhookEventRow } from "./data";
import { ReplayButton } from "./replay-button";

export const dynamic = "force-dynamic";

const FILTRY = [
  { value: "", label: "Wymagające uwagi" },
  { value: "FAILED", label: "Nieudane" },
  { value: "PENDING", label: "W trakcie" },
  { value: "PROCESSED", label: "Przetworzone" },
  { value: "wszystkie", label: "Wszystkie" },
];

const KOLOR: Record<WebhookEventRow["status"], string> = {
  PROCESSED: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  FAILED: "border-red-500/40 bg-red-500/10 text-red-200",
  PENDING: "border-amber-500/40 bg-amber-500/10 text-amber-200",
};

const ETYKIETA: Record<WebhookEventRow["status"], string> = {
  PROCESSED: "przetworzone",
  FAILED: "nieudane",
  PENDING: "w trakcie",
};

function czas(v: string | null): string {
  if (!v) return "—";
  return new Date(v).toLocaleString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function powodBrakuPonowienia(z: WebhookEventRow): string | null {
  if (z.status === "PROCESSED") return "przetworzone";
  if (z.payloadPurgedAt) return "treść wyczyszczona przez retencję";
  return "brak zapisanej treści";
}

export default async function WebhookiPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const status = sp.status ?? "";
  const dane = await listWebhookEvents(status || undefined);
  const { podsumowanie } = dane;
  const wymagaUwagi = podsumowanie.failed + podsumowanie.pending;

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Zdarzenia webhooka Stripe</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Z-05 — zdarzenie, którego handler nie obsłużył, zostaje tutaj zamiast zniknąć.
          Ponowienie jest bezpieczne: księgowanie portfela jest idempotentne po kluczu sesji,
          więc powtórzenie nie doda pieniędzy drugi raz.
        </p>
      </header>

      {wymagaUwagi > 0 && (
        <div className="rounded-md border border-red-600/40 bg-red-500/10 p-4 text-sm text-red-100">
          <b>{wymagaUwagi}</b>{" "}
          {wymagaUwagi === 1 ? "zdarzenie nie zostało obsłużone" : "zdarzeń nie zostało obsłużonych"}.
          Jeżeli dotyczą doładowania albo opłaty za subskrypcję, pieniądze mogły zostać
          pobrane, a saldo albo aktywacja nie nastąpiły.
          <p className="mt-2 text-xs text-red-200/80">
            Zanim zaczniesz księgować cokolwiek ręcznie, sprawdź w panelu Stripe, czy płatność
            faktycznie doszła i nie została zwrócona.
          </p>
        </div>
      )}

      <section className="grid grid-cols-3 gap-3">
        {[
          ["Nieudane", podsumowanie.failed, "text-red-300"],
          ["W trakcie", podsumowanie.pending, "text-amber-300"],
          ["Przetworzone", podsumowanie.processed, "text-emerald-300"],
        ].map(([label, n, kolor]) => (
          <div key={String(label)} className="rounded-lg border border-white/10 bg-black/20 p-4">
            <div className={`text-2xl font-semibold ${kolor as string}`}>{n as number}</div>
            <div className="mt-1 text-xs text-neutral-400">{label as string}</div>
          </div>
        ))}
      </section>

      <nav className="flex flex-wrap gap-2">
        {FILTRY.map((f) => (
          <a
            key={f.value}
            href={f.value ? `?status=${f.value}` : "?"}
            className={`rounded-md border px-3 py-1 text-xs ${
              status === f.value
                ? "border-indigo-500/50 bg-indigo-500/15 text-indigo-200"
                : "border-white/10 text-neutral-400 hover:bg-white/5"
            }`}
          >
            {f.label}
          </a>
        ))}
      </nav>

      <div className="overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-white/5 text-xs uppercase tracking-wide text-neutral-400">
            <tr>
              <th className="px-3 py-2 text-left">Zdarzenie</th>
              <th className="px-3 py-2 text-left">Typ</th>
              <th className="px-3 py-2 text-left">Stan</th>
              <th className="px-3 py-2 text-right">Prób</th>
              <th className="px-3 py-2 text-left">Wpłynęło</th>
              <th className="px-3 py-2 text-left">Następna próba</th>
              <th className="px-3 py-2 text-left">Ostatni błąd</th>
              <th className="px-3 py-2 text-right">Akcja</th>
            </tr>
          </thead>
          <tbody>
            {dane.zdarzenia.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-neutral-500">
                  Nic tu nie ma — przy tym filtrze to dobra wiadomość.
                </td>
              </tr>
            )}
            {dane.zdarzenia.map((z) => (
              <tr
                key={z.eventId}
                className={`border-t border-white/5 ${z.zaciete ? "bg-red-500/5" : ""}`}
              >
                <td className="px-3 py-2 font-mono text-xs text-neutral-300">{z.eventId}</td>
                <td className="px-3 py-2 text-xs text-neutral-400">{z.type}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] ${KOLOR[z.status]}`}>
                    {ETYKIETA[z.status]}
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-xs">
                  <span className={z.attempts >= dane.progAlertu ? "text-red-300" : ""}>
                    {z.attempts}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-neutral-400">{czas(z.createdAt)}</td>
                <td className="px-3 py-2 text-xs text-neutral-400">{czas(z.nextAttemptAt)}</td>
                <td className="max-w-[320px] px-3 py-2">
                  {z.lastError ? (
                    <span className="block truncate text-xs text-red-300" title={z.lastError}>
                      {z.lastError}
                    </span>
                  ) : (
                    <span className="text-xs text-neutral-600">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <ReplayButton
                    eventId={z.eventId}
                    disabled={!z.mozliwePonowienie}
                    powod={powodBrakuPonowienia(z)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-neutral-500">
        Ponowienia idą też automatycznie, z narastającym odstępem (1, 5, 15, 60 min). Po
        {" "}{dane.progAlertu} nieudanych próbach albo 15 minutach od pierwszej dostawy wszyscy
        administratorzy dostają maila. Treść zdarzenia jest kasowana 90 dni po przetworzeniu —
        wtedy ponowienie przestaje być możliwe, ale sam wiersz zostaje na zawsze, bo to on
        odrzuca powtórne dostawy.
      </p>
    </div>
  );
}
