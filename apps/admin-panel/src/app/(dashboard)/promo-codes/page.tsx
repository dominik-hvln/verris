import { Tag, Calendar, Users2, AlertCircle } from "lucide-react";
import { listPromoCodes, type PromoCodeRow } from "./data";
import { CreatePromoForm } from "./create-promo-form";
import { CreateServicePromoForm } from "./create-service-promo-form";

export const dynamic = "force-dynamic";

export default async function PromoCodesPage() {
  let rows: PromoCodeRow[] = [];
  let error: string | null = null;
  try {
    rows = await listPromoCodes();
  } catch (err) {
    error = err instanceof Error ? err.message : "Nieznany błąd";
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-white">
          Kody promocyjne
        </h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-3xl">
          Utwórz kod, który po wpisaniu w panelu klienta zasili portfel ustaloną liczbą kredytów Verris (1 zł = 1 K).
          Każdy kod może mieć limit realizacji i datę ważności. Klient widzi w historii transakcji opisaną pozycję
          „Kod promocyjny: NAZWA".
        </p>
      </header>

      <div className="grid gap-6 xl:grid-cols-2">
        <CreatePromoForm />
        <CreateServicePromoForm />
      </div>

      {error ? (
        <div className="flex items-center gap-2 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Nie udało się pobrać listy kodów: {error}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center">
          <Tag className="h-10 w-10 mx-auto text-muted-foreground" />
          <h3 className="mt-4 text-base font-bold text-white">Brak kodów</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Utwórz pierwszy kod powyżej — pojawi się tutaj wraz ze statystyką realizacji.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-black/30 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-white">
              <thead className="bg-white/[0.04] border-b border-white/10 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-6 py-3 font-medium">Kod</th>
                  <th className="px-6 py-3 font-medium">Typ</th>
                  <th className="px-6 py-3 font-medium">Wartość</th>
                  <th className="px-6 py-3 font-medium">Realizacje</th>
                  <th className="px-6 py-3 font-medium">Ważność</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-mono font-semibold text-white text-sm">
                        {row.code}
                      </div>
                      {row.description ? (
                        <div className="text-[11px] text-muted-foreground mt-0.5 max-w-xs truncate">
                          {row.description}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-6 py-4">
                      <KindBadge kind={row.kind} />
                    </td>
                    <td className="px-6 py-4 font-mono tabular-nums">
                      {row.kind === "SERVICE_PERCENT_OFF" ? (
                        <span className="text-indigo-300">
                          −{Number.parseFloat(row.value).toFixed(0)}%
                          {row.appliesToRenewals ? (
                            <span className="ml-1 text-[10px] text-muted-foreground">+ odnowienia</span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="text-emerald-300">+{Number.parseFloat(row.value).toFixed(2)} K</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 text-xs">
                        <Users2 className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-mono tabular-nums">
                          {row.redemptionCount}
                          {row.maxRedemptions ? ` / ${row.maxRedemptions}` : ""}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs">
                      {row.validTo ? (
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Calendar className="h-3.5 w-3.5" />
                          do {new Date(row.validTo).toLocaleDateString("pl-PL")}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">bezterminowo</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge row={row} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function KindBadge({ kind }: { kind: PromoCodeRow["kind"] }) {
  if (kind === "FIXED_CREDIT") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
        Zasilanie kredytów
      </span>
    );
  }
  if (kind === "SERVICE_PERCENT_OFF") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/10 text-indigo-300 border border-indigo-500/30">
        Rabat na usługę
      </span>
    );
  }
  if (kind === "PERCENT_BONUS") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30">
        Bonus % portfel
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-neutral-500/10 text-neutral-400 border border-neutral-500/30">
      {kind}
    </span>
  );
}

function StatusBadge({ row }: { row: PromoCodeRow }) {
  const now = Date.now();
  const expired = row.validTo && new Date(row.validTo).getTime() < now;
  const exhausted =
    row.maxRedemptions != null && row.redemptionCount >= row.maxRedemptions;

  if (!row.active) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-neutral-500/10 text-neutral-400 border border-neutral-500/30">
        Nieaktywny
      </span>
    );
  }
  if (expired) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-300 border border-rose-500/30">
        Wygasł
      </span>
    );
  }
  if (exhausted) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30">
        Wykorzystany
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
      Aktywny
    </span>
  );
}
