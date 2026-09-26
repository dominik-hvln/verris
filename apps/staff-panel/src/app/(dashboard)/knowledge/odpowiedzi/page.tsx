import { staffApi } from "@/lib/staff-api";
import type { CannedResponseRow } from "@/lib/ticket-actions";
import { BladStrony } from "@/components/blad-strony";

export const dynamic = "force-dynamic";

const KATEGORIE: [string | null, string][] = [
  ["POWITANIE", "Powitanie"],
  ["DIAGNOZA", "Diagnoza"],
  ["OPOZNIENIE", "Dłużej niż zwykle"],
  ["ZALECENIA", "Zalecenia"],
  ["ZAMKNIECIE", "Zamknięcie"],
  [null, "Pozostałe"],
];

/** PB-37 — baza odpowiedzi dla obsługi (podgląd; treści i kategorie zmienia administrator w panelu admina). */
export default async function BazaOdpowiedziPage() {
  let rows: CannedResponseRow[];
  try {
    rows = await staffApi<CannedResponseRow[]>("/tickets/canned");
  } catch (e) {
    return <BladStrony blad={e} tytul="Baza odpowiedzi" powrot={{ href: "/", label: "Powrót do skrzynki" }} />;
  }
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Wiedza</span>
        <h1 className="font-display text-[30px] font-extrabold tracking-[-0.02em]">Baza odpowiedzi</h1>
        <p className="text-sm text-muted-foreground">
          Szablony do wstawienia w zgłoszeniu (blok „Podpowiedzi” albo <span className="font-mono">/skrót</span> w polu odpowiedzi). Zmienne typu imię klienta podstawiają się same.
          Treści zmienia administrator.
        </p>
      </header>
      {KATEGORIE.map(([k, nazwa]) => {
        const lista = rows.filter((r) => (k ? r.category === k : !KATEGORIE.some(([x]) => x && x === r.category)));
        if (!lista.length) return null;
        return (
          <section key={nazwa} className="overflow-hidden rounded-[10px] border border-line bg-card" aria-label={nazwa}>
            <h2 className="px-4 py-3 font-display text-[15px] font-bold">
              {nazwa} <span className="font-mono text-xs font-normal text-muted-foreground">{lista.length}</span>
            </h2>
            {lista.map((r) => (
              <details key={r.id} className="border-t border-line px-4 py-3">
                <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm font-semibold">
                  {r.title}
                  {r.shortcut ? <kbd className="rounded-[5px] border border-line-strong px-1.5 py-px font-mono text-[11px] font-normal text-muted-foreground">/{r.shortcut}</kbd> : null}
                </summary>
                <p className="mt-2 whitespace-pre-wrap text-[13.5px] leading-[1.55] text-[color:var(--verris-body)]">{r.content}</p>
              </details>
            ))}
          </section>
        );
      })}
    </div>
  );
}
