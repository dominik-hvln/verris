import { fetchAdminDashboardOverview } from "@/lib/admin-overview-data";
import { WalletCsvExportButton } from "./csv-export-button";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  let overview = null as Awaited<ReturnType<typeof fetchAdminDashboardOverview>> | null;
  let err: string | null = null;
  try {
    overview = await fetchAdminDashboardOverview();
  } catch (e) {
    err = e instanceof Error ? e.message : "Błąd";
  }

  const b = overview?.billing;
  const types = b?.walletByTypePln ?? {};

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-white">Rozliczenia (portfel)</h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
          Agregaty z rzeczywistego ledgera (`WalletTransaction`). Pełny wyciąg anonimowych / wszystkich
          ruchów w CSV — zgodnie z uprawnieniami API administratora (401 przy braku ważnego JWT lub roli ADMIN).
          Upewnij się, że jesteś zalogowany i API działa na <code className="text-indigo-300">API_URL</code>.
        </p>
      </header>

      {err ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          Nie udało się pobrać metryk: {err}
        </div>
      ) : null}

      {overview && b ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-black/35 p-6">
            <h2 className="text-lg font-semibold text-white mb-2">
              Podsumowanie {b.periodDays} dni (portfel)
            </h2>
            <p className="text-3xl font-bold tabular-nums text-white">{b.walletNetPln} PLN</p>
            <p className="text-xs text-muted-foreground mt-1">
              Suma ze znakiem (+wpływy / −obciążenia), status COMPLETED — netto OKRESU.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/35 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Eksport Ledgera</h2>
            <WalletCsvExportButton />
          </div>
        </div>
      ) : null}

      {overview && Object.keys(types).length > 0 ? (
        <div className="rounded-2xl border border-white/10 bg-black/35 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Typ transakcji</th>
                <th className="px-4 py-3 text-right">Suma PLN ({b!.periodDays} dni)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {Object.entries(types).map(([k, v]) => (
                <tr key={k}>
                  <td className="px-4 py-2 text-white">{k}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
