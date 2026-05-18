import type { AdminConsentRow } from "./data";

const KIND_LABEL: Record<string, string> = {
  TERMS: "Regulamin",
  PRIVACY: "Polityka prywatności",
  COOKIES: "Cookies",
  DPA: "DPA",
};

const SOURCE_LABEL: Record<string, string> = {
  REGISTRATION: "Rejestracja",
  RE_CONSENT: "Re-akceptacja",
  SETTINGS: "Ustawienia",
  ADMIN_MANUAL: "Ręczne (admin)",
};

export function ConsentsTable({
  rows,
  total,
}: {
  rows: AdminConsentRow[];
  total: number;
}) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Łącznie {total} zgód w systemie. Pokazujemy najnowsze 100.
      </p>
      <div className="rounded-2xl border border-white/10 bg-black/30 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-white">
            <thead className="bg-white/[0.04] border-b border-white/10 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Klient</th>
                <th className="px-4 py-3 font-medium">Dokument</th>
                <th className="px-4 py-3 font-medium">Wersja</th>
                <th className="px-4 py-3 font-medium">Źródło</th>
                <th className="px-4 py-3 font-medium">IP</th>
                <th className="px-4 py-3 font-medium">Data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                    Brak zgód.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-white/[0.02]">
                  <td className="px-4 py-3 text-xs text-neutral-200">
                    {r.user?.email ?? r.userId}
                    {r.user?.anonymizedAt && (
                      <span className="ml-2 text-[10px] text-rose-400">[anonimizowany]</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">{KIND_LABEL[r.documentKind] ?? r.documentKind}</td>
                  <td className="px-4 py-3 font-mono text-xs">{r.documentVersion}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {SOURCE_LABEL[r.source] ?? r.source}
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">
                    {r.ipAddress ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(r.grantedAt).toLocaleString("pl-PL")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
