import Link from "next/link";
import { adminApi } from "@/lib/api";
import { nodes as nodesLabel, accounts as accountsLabel } from "@/lib/pl";

export const dynamic = "force-dynamic";

interface BusinessMetrics {
  generatedAt: string;
  mrr: string;
  arpu: string;
  activeServices: number;
  trials: number;
  newThisMonth: number;
  canceledThisMonth: number;
  churnPct: number;
  byProduct: { productKind: string; count: number }[];
  walletLiability: string;
  fleet: {
    nodes: number;
    accounts: number;
    cpuUtilPct: number | null;
    ramUtilPct: number | null;
    diskUtilPct: number | null;
  };
}

const PRODUCT_PL: Record<string, string> = { HOSTING: "Hosting", EMAIL: "Poczta", VPS: "VPS" };

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/35 p-5">
      <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-bold text-white">{value}</p>
      {hint ? <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Bar({ label, pct }: { label: string; pct: number | null }) {
  const v = pct ?? 0;
  const color = v >= 85 ? "bg-rose-400" : v >= 65 ? "bg-amber-400" : "bg-emerald-400";
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-white">{pct == null ? "—" : `${pct}%`}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, v)}%` }} />
      </div>
    </div>
  );
}

export default async function BusinessMetricsPage() {
  let m: BusinessMetrics | null = null;
  let error: string | null = null;
  try {
    m = await adminApi<BusinessMetrics>("/admin/metrics/business");
  } catch {
    error = "Nie udało się pobrać metryk biznesowych.";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Metryki biznesowe</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Przychód, klienci i wykorzystanie floty — liczone na żywo z danych platformy.
        </p>
      </div>

      {error || !m ? (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error ?? "Brak danych."}
        </p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="MRR" value={`${m.mrr} PLN`} hint="Miesięczny przychód powtarzalny (rok → /12)" />
            <Stat label="ARPU" value={`${m.arpu} PLN`} hint="Średni przychód na aktywną usługę" />
            <Stat label="Usługi aktywne" value={String(m.activeServices)} hint={`Trial: ${m.trials}`} />
            <Stat
              label="Churn (mies.)"
              value={`${m.churnPct}%`}
              hint={`${m.canceledThisMonth} anulowanych / +${m.newThisMonth} nowych`}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-black/35 p-5">
              <h2 className="mb-3 text-sm font-semibold text-white">Aktywne usługi wg produktu</h2>
              {m.byProduct.length === 0 ? (
                <p className="text-xs text-muted-foreground">Brak aktywnych usług.</p>
              ) : (
                <ul className="space-y-2">
                  {m.byProduct.map((p) => (
                    <li key={p.productKind} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{PRODUCT_PL[p.productKind] ?? p.productKind}</span>
                      <span className="font-semibold text-white">{p.count}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-4 border-t border-white/10 pt-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Zobowiązania portfeli (saldo klientów)</span>
                  <span className="font-semibold text-white">{m.walletLiability} PLN</span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/35 p-5">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-white">
                  Wykorzystanie floty ({nodesLabel(m.fleet.nodes)} · {accountsLabel(m.fleet.accounts)})
                </h2>
                <Link
                  href="/nodes/capacity"
                  className="shrink-0 text-xs font-medium text-sky-400 hover:text-sky-300 hover:underline"
                >
                  Pojemność floty →
                </Link>
              </div>
              <div className="space-y-3">
                <Bar label="CPU (alokacja planów)" pct={m.fleet.cpuUtilPct} />
                <Bar label="RAM" pct={m.fleet.ramUtilPct} />
                <Bar label="Dysk" pct={m.fleet.diskUtilPct} />
              </div>
              <p className="mt-3 text-[10px] text-muted-foreground">
                To alokacja (suma limitów planów) — realne planowanie miejsca i „ile kont jeszcze
                wejdzie" jest w widoku Pojemność floty.
              </p>
            </div>
          </div>

          <p className="text-[10px] text-muted-foreground">
            Wygenerowano: {new Date(m.generatedAt).toLocaleString("pl-PL")}
          </p>
        </>
      )}
    </div>
  );
}
