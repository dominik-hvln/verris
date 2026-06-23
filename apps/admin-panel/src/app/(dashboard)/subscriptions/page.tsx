import Link from "next/link";
import { listAdminSubscriptions } from "./data";

export const dynamic = "force-dynamic";

export default async function AdminSubscriptionsPage() {
  let rows: Awaited<ReturnType<typeof listAdminSubscriptions>> = [];
  let error: string | null = null;
  try {
    rows = await listAdminSubscriptions();
  } catch (e) {
    error = e instanceof Error ? e.message : "Nie udało się pobrać listy.";
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-white">Subskrypcje</h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
          Lista usług hostingu z bazy ({rows.length} rekordów na tej stronie — API zwraca do 200
          najnowszych).
        </p>
      </header>

      {error ? (
        <p className="text-sm text-rose-300">{error}</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/35">
          <table className="w-full text-left text-sm text-white">
            <thead className="border-b border-white/10 bg-white/5 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Klient</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Usługa (ID)</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Interval</th>
                <th className="px-4 py-3 text-right">Cena</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-white/[0.03]">
                  <td className="px-4 py-3">
                    <p className="font-medium truncate max-w-[14rem]">{r.user.email}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{r.plan.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {r.serviceTag ?? r.account?.daUsername ?? "—"}
                  </td>
                  <td className="px-4 py-3">{r.status}</td>
                  <td className="px-4 py-3">{r.interval}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {String(r.priceAmount)} {r.currency}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/subscriptions/${r.id}`}
                      className="text-xs text-indigo-400 hover:underline"
                    >
                      Szczegóły
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 ? (
            <p className="p-8 text-center text-muted-foreground text-sm">Brak subskrypcji w bazie.</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
