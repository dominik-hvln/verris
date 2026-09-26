import { AlertCircle, UserPlus } from "lucide-react";
import { listTesters, type TesterRow } from "./actions";
import { InviteForm } from "./invite-form";
import { RevokeButton } from "./revoke-button";

export const dynamic = "force-dynamic";

const STAN: Record<TesterRow["stan"], { text: string; cls: string }> = {
  CZEKA: { text: "czeka na użycie", cls: "border-white/15 text-neutral-300" },
  UZYTY: { text: "kod użyty", cls: "border-emerald-400/30 text-emerald-200" },
  WYCOFANY: { text: "wyłączony", cls: "border-rose-500/30 text-rose-200" },
  WYGASL: { text: "wygasł", cls: "border-amber-500/30 text-amber-200" },
};

const data = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pl-PL", { day: "numeric", month: "short", timeZone: "Europe/Warsaw" }) : "—";

/** PB-26 — otwarte testy przed startem: zaproszenia i postęp testerów (docs/ops/BETA_TESTY.md). */
export default async function BetaPage() {
  let rows: TesterRow[] = [];
  let error: string | null = null;
  try {
    rows = await listTesters();
  } catch (err) {
    error = err instanceof Error ? err.message : "Nieznany błąd";
  }
  const uzyte = rows.filter((r) => r.stan === "UZYTY");
  const zUsluga = uzyte.filter((r) => r.aktywneUslugi > 0).length;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-[28px] lg:text-[34px]">Testy (beta)</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Zaproszenia do testów przed startem. Tester to osoba, która zrealizowała swój kod; jej zgłoszenia z tematem „Testy (beta)” mają w panelu obsługi znacznik Beta.
          Cel: co najmniej 80% testerów z działającą stroną bez pomocy wsparcia.
        </p>
      </header>

      <InviteForm />

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Zaproszenia", rows.length],
          ["Kody użyte", uzyte.length],
          ["Testerzy z aktywną usługą", uzyte.length ? `${zUsluga} (${Math.round((zUsluga / uzyte.length) * 100)}%)` : "0"],
        ].map(([l, n]) => (
          <div key={String(l)} className="rounded-2xl border border-white/10 bg-[#0a0a0a] px-5 py-4">
            <div className="text-2xl font-bold text-white">{n}</div>
            <div className="mt-1 text-xs text-muted-foreground">{l}</div>
          </div>
        ))}
      </div>

      {error ? (
        <div className="flex items-center gap-2 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          <AlertCircle className="h-4 w-4 shrink-0" /> Nie udało się pobrać listy: {error}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center">
          <UserPlus className="mx-auto h-10 w-10 text-muted-foreground" />
          <h3 className="mt-4 text-base font-bold text-white">Nikt jeszcze nie został zaproszony</h3>
          <p className="mt-1 text-sm text-muted-foreground">Wyślij pierwsze zaproszenie formularzem powyżej.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/30">
          <table className="w-full text-left text-sm text-white">
            <thead className="border-b border-white/10 bg-white/[0.04] text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Osoba</th>
                <th className="px-4 py-3 font-medium">Kod</th>
                <th className="px-4 py-3 font-medium">Stan</th>
                <th className="px-4 py-3 font-medium">Konto</th>
                <th className="px-4 py-3 font-medium">Usługi</th>
                <th className="px-4 py-3 font-medium">Zgłoszenia</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.name || r.email}</div>
                    {r.name ? <div className="text-xs text-muted-foreground">{r.email}</div> : null}
                    <div className="text-xs text-muted-foreground">{r.wyslane ? `mail ${data(r.wyslane)}` : "mail niewysłany"}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {r.code}
                    <div className="text-muted-foreground">do {data(r.waznyDo)}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${STAN[r.stan].cls}`}>{STAN[r.stan].text}</span>
                  </td>
                  <td className="px-4 py-3 text-xs">{r.konto ? `${r.konto.email} · od ${data(r.konto.od)}` : "—"}</td>
                  <td className="px-4 py-3">{r.aktywneUslugi}</td>
                  <td className="px-4 py-3">
                    {r.zgloszenia}
                    {r.zgloszeniaOtwarte ? <span className="text-xs text-amber-200"> ({r.zgloszeniaOtwarte} otwarte)</span> : null}
                  </td>
                  <td className="px-4 py-3 text-right">{r.stan === "CZEKA" ? <RevokeButton id={r.id} code={r.code} /> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
