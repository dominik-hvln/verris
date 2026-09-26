import Link from "next/link";
import { Plus, Gauge } from "lucide-react";
import type { ServerSummaryDto } from "@verris/contracts";
import { adminApi } from "@/lib/api";
import { plural } from "@/lib/pl";
import { Eyebrow, KARTA, Pasek, Pigulka, PRZYCISK, PRZYCISK_GLOWNY, WIERSZ } from "@/components/v2";
import { fetchServers } from "./actions";
import { FleetUpdateButton } from "./fleet-update-button";

export const dynamic = "force-dynamic";

/** Wiersz `GET /admin/servers/flota` — te same reguły stanu co pulpit („Flota”). */
interface WierszFloty {
  id: string;
  nazwa: string;
  ip: string;
  region: string | null;
  status: string;
  stan: "ok" | "warn" | "crit";
  cpuProc: number | null;
  poza: string | null;
  konta: number;
  limitKont: number | null;
  manifest: string | null;
  sygnal: string;
  naZywo: boolean;
}

const STATUS: Record<string, string> = {
  ACTIVE: "Aktywny",
  INIT: "Zakładanie",
  PENDING_APPROVAL: "Czeka na zatwierdzenie",
  MAINTENANCE: "Serwis",
  OFFLINE: "Offline",
  DEPROVISIONING: "Wycofywany",
};

const gb = (mb: number | null | undefined) => (mb ? `${Math.round(mb / 1024).toLocaleString("pl-PL")} GB` : null);

/** PB-34 — lista węzłów w języku makiety (tabela jak karta „Flota” na pulpicie). */
export default async function AdminNodesPage() {
  const [{ data: servers, error }, flota] = await Promise.all([
    fetchServers(),
    adminApi<WierszFloty[]>("/admin/servers/flota").catch(() => null),
  ]);
  const wg = new Map(servers.map((s) => [s.id, s]));
  const wiersze: WierszFloty[] =
    flota ??
    // API bez /flota (albo błąd) — lista z samych rekordów, bez CPU realnego.
    servers.map((s) => ({
      id: s.id,
      nazwa: s.name || s.ipAddress,
      ip: s.ipAddress,
      region: s.region,
      status: s.status,
      stan: s.status === "OFFLINE" ? "crit" : s.status === "ACTIVE" ? "ok" : "warn",
      cpuProc: null,
      poza: null,
      konta: s._count?.accounts ?? 0,
      limitKont: s.maxAccounts,
      manifest: null,
      sygnal: s.sygnal?.etykieta ?? "—",
      naZywo: s.sygnal?.stan === "odpowiada",
    }));
  const liczby = servers.reduce<Record<string, number>>((a, s) => ({ ...a, [s.status]: (a[s.status] ?? 0) + 1 }), {});
  const dziala = wiersze.filter((w) => w.status === "ACTIVE" && w.stan !== "crit").length;

  return (
    <div className="flex flex-col gap-[22px]">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-2">
          <Eyebrow>Flota</Eyebrow>
          <h1 className="text-[32px] lg:text-[40px]">Węzły</h1>
          <div className="flex flex-wrap items-center gap-2 text-[15px] text-muted-foreground">
            <span>
              {plural(wiersze.length, "węzeł", "węzły", "węzłów")} · {dziala} działa
            </span>
            {(["PENDING_APPROVAL", "INIT", "MAINTENANCE", "OFFLINE"] as const).map((k) =>
              liczby[k] ? (
                <Pigulka key={k} ton={k === "OFFLINE" ? "crit" : "warn"} className="!text-xs">
                  {STATUS[k]}: {liczby[k]}
                </Pigulka>
              ) : null,
            )}
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2.5">
          <Link href="/nodes/capacity" className={PRZYCISK}>
            <Gauge className="h-4 w-4" />
            Pojemność floty
          </Link>
          <FleetUpdateButton />
          <Link href="/nodes/wizard" className={PRZYCISK_GLOWNY}>
            <Plus className="h-[15px] w-[15px]" strokeWidth={2.4} />
            Dodaj węzeł
          </Link>
        </div>
      </div>

      {error ? (
        <div className="rounded-[10px] border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">Nie udało się pobrać listy węzłów: {error}</div>
      ) : null}

      <section className={KARTA} aria-label="Węzły">
        <div className={`${WIERSZ} !border-t-0 !py-2.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground`}>
          <span className="min-w-0 flex-1">Węzeł</span>
          <span className="hidden w-[190px] md:block">Stan</span>
          <span className="w-[120px] sm:w-[180px]">CPU realne</span>
          <span className="w-[70px] text-right">Konta</span>
          <span className="hidden w-[110px] lg:block">Manifest</span>
          <span className="w-[80px] text-right">Sygnał</span>
        </div>
        {wiersze.length === 0 ? (
          <div className={`${WIERSZ} flex-col items-start gap-3 py-8`}>
            <span className="font-semibold">Nie masz jeszcze żadnych węzłów</span>
            <span className="text-sm text-muted-foreground">Kreator wygeneruje jednorazowy skrypt instalacyjny i przeprowadzi przez zatwierdzenie, kopie i onboard.</span>
            <Link href="/nodes/wizard" className={PRZYCISK_GLOWNY}>
              <Plus className="h-4 w-4" /> Uruchom kreator węzła
            </Link>
          </div>
        ) : (
          wiersze.map((w) => {
            const s: ServerSummaryDto | undefined = wg.get(w.id);
            const zasoby = [s?.totalCpuCores ? `${s.totalCpuCores} rdz.` : null, gb(s?.totalMemoryMb) ? `${gb(s?.totalMemoryMb)} RAM` : null].filter(Boolean);
            return (
              <Link key={w.id} href={`/nodes/${w.id}`} className={`${WIERSZ} hover:bg-raised`}>
                <span className="flex min-w-0 flex-1 items-center gap-2.5">
                  <span className={`h-[7px] w-[7px] shrink-0 rounded-full ${w.stan === "crit" ? "bg-crit" : w.stan === "warn" ? "bg-warn" : "bg-data"}`} />
                  <span className="flex min-w-0 flex-col">
                    <span className="font-mono text-[13px] font-semibold">{w.nazwa}</span>
                    <span className="text-[12.5px] text-muted-foreground">{[w.ip, w.region, ...zasoby].filter(Boolean).join(" · ")}</span>
                  </span>
                </span>
                <span className="hidden w-[190px] md:block">
                  <Pigulka ton={w.stan === "crit" ? "crit" : w.poza || w.stan === "warn" ? "warn" : "ok"} className="!text-xs">
                    {w.poza ?? (w.stan === "crit" ? "brak sygnału" : w.stan === "warn" ? "wysokie obciążenie CPU" : STATUS[w.status] ?? w.status)}
                  </Pigulka>
                </span>
                <span className="w-[120px] sm:w-[180px]">
                  {w.cpuProc == null ? <span className="text-[13px] text-muted-foreground">brak próbek</span> : <Pasek proc={w.cpuProc} ton={w.cpuProc >= 60 ? "warn" : "ok"} />}
                </span>
                <span className="w-[70px] text-right font-mono text-[13px]">
                  {w.konta}
                  {w.limitKont ? <span className="text-muted-foreground">/{w.limitKont}</span> : null}
                </span>
                <span className="hidden w-[110px] font-mono text-xs text-muted-foreground lg:block">{w.manifest ?? "—"}</span>
                <span className={`w-[80px] text-right text-[13px] ${w.naZywo ? "text-data-hi" : w.stan === "crit" ? "text-crit" : "text-muted-foreground"}`}>{w.sygnal}</span>
              </Link>
            );
          })
        )}
      </section>
    </div>
  );
}
