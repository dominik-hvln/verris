import { adminApi } from "@/lib/api";
import { BladStrony } from "@/components/blad-strony";
import { AutoWiadomosciEdytor } from "./auto-wiadomosci";
import type { OcenaAgenta, WidokAuto } from "./actions";

export const dynamic = "force-dynamic";

/** PB-37 — opieka nad zgłoszeniami: treści automatycznych wiadomości do klienta i oceny opiekunów. */
export default async function OpiekaZgloszenPage({ searchParams }: { searchParams: Promise<{ dni?: string }> }) {
  const { dni: d } = await searchParams;
  const dni = d === "90" ? 90 : d === "365" ? 365 : 30;
  let widok: WidokAuto;
  let oceny: OcenaAgenta[];
  try {
    [widok, oceny] = await Promise.all([
      adminApi<WidokAuto>("/admin/support/auto-messages"),
      adminApi<OcenaAgenta[]>(`/admin/support/ratings?days=${dni}`),
    ]);
  } catch (e) {
    return <BladStrony blad={e} tytul="Opieka nad zgłoszeniami" />;
  }
  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-[28px] lg:text-[34px]">Opieka nad zgłoszeniami</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Klient nigdy nie zgaduje, czy wiadomość do nas trafiła: każda z tych wiadomości idzie e-mailem i jest widoczna w zgłoszeniu (u klienta i w obsłudze).
          Nie liczą się jako odpowiedź — terminy odpowiedzi biegną dalej, dopóki nie odpisze człowiek.
        </p>
      </header>

      <AutoWiadomosciEdytor widok={widok} />

      <section className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-base font-semibold">Oceny opiekunów</h2>
          <nav className="ml-auto flex gap-1 text-xs" aria-label="Okres">
            {[30, 90, 365].map((x) => (
              <a
                key={x}
                href={`?dni=${x}`}
                aria-current={dni === x ? "page" : undefined}
                className={`rounded-md border px-2.5 py-1 ${dni === x ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200" : "border-white/10 text-neutral-300 hover:bg-white/5"}`}
              >
                {x} dni
              </a>
            ))}
          </nav>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Po zamknięciu zgłoszenia klient ocenia opiekuna i obsługę ogólnie (1–5) oraz czy problem został rozwiązany.</p>
        {oceny.length === 0 ? (
          <p className="mt-4 text-sm text-neutral-400">Brak ocen w tym okresie.</p>
        ) : (
          <table className="v2-stack mt-3 w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-neutral-400">
                <th className="py-2 pr-3">Opiekun</th>
                <th className="py-2 pr-3">Ocena opiekuna</th>
                <th className="py-2 pr-3">Obsługa ogólnie</th>
                <th className="py-2 pr-3">Rozwiązane</th>
                <th className="py-2">Ocen</th>
              </tr>
            </thead>
            <tbody>
              {oceny.map((o) => (
                <tr key={o.agentId} className="border-t border-white/10">
                  <td data-label="Opiekun" className="py-2 pr-3 font-medium">{o.nazwa}</td>
                  <td data-label="Ocena opiekuna" className="py-2 pr-3">{o.opiekun?.toLocaleString("pl-PL") ?? "—"} / 5</td>
                  <td data-label="Obsługa ogólnie" className="py-2 pr-3">{o.support?.toLocaleString("pl-PL") ?? "—"} / 5</td>
                  <td data-label="Rozwiązane" className="py-2 pr-3">{o.rozwiazanePct != null ? `${o.rozwiazanePct}%` : "—"}</td>
                  <td data-label="Ocen" className="py-2">{o.ocen}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
