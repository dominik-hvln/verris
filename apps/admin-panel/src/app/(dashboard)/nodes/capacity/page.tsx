import Link from "next/link";
import { ArrowLeft, AlertCircle, Cpu, MemoryStick, HardDrive, Gauge, Ban } from "lucide-react";
import { adminApi } from "@/lib/api";
import { nodes as nodesLabel, plForm } from "@/lib/pl";

export const dynamic = "force-dynamic";

type Trojka = { cpu: number; ramMb: number; diskMb: number };

/** Pola `GET /admin/servers/wykresy` (apps/api/src/servers/wykresy-floty.ts) potrzebne tej stronie. */
interface Wezel {
  id: string;
  name: string;
  region: string | null;
  status: string;
  accounts: number;
  pozaPula: string | null;
  acceptsNewAccounts: boolean;
  reservedHeadroomPercent: number;
  maxAccounts: number | null;
  zasoby: {
    fizyczna: Trojka;
    sprzedawalna: Trojka;
    przydzielone: Trojka;
    zuzyte: Trojka | null;
    zapas: { kont: number; wymiar: string } | null;
  } | null;
}

const WYMIARY = [
  { k: "cpu", nazwa: "CPU", ikona: <Cpu className="h-4 w-4" />, fmt: (v: number) => `${Math.round(v)}%` },
  { k: "ramMb", nazwa: "RAM", ikona: <MemoryStick className="h-4 w-4" />, fmt: formatMb },
  { k: "diskMb", nazwa: "Dysk", ikona: <HardDrive className="h-4 w-4" />, fmt: formatMb },
] as const;

/**
 * Pojemność floty w dwóch miarach, których nie wolno mieszać:
 * - zużycie — co konta realnie zużywają teraz (telemetria LVE) wobec sprzętu: ryzyko przeciążenia;
 * - sprzedane — suma limitów planów wobec tego, co węzeł może sprzedać (sprzęt × overcommit): miejsce na nowe konta.
 * Te same reguły co automatyczny przydział kont i prognoza węzła.
 */
export default async function FleetCapacityPage() {
  let wezly: Wezel[] = [];
  let error: string | null = null;
  try {
    wezly = (await adminApi<{ wezly: Wezel[] }>("/admin/servers/wykresy?zakres=1h&sort=nazwa")).wezly;
  } catch (e) {
    error = e instanceof Error ? e.message : "błąd";
  }

  const hostujace = wezly.filter((w) => (w.status === "ACTIVE" || w.status === "MAINTENANCE") && w.zasoby);
  const suma = (f: (z: NonNullable<Wezel["zasoby"]>) => Trojka | null) => {
    const out = { cpu: 0, ramMb: 0, diskMb: 0 };
    for (const w of hostujace) {
      const t = f(w.zasoby!);
      if (t) for (const { k } of WYMIARY) out[k] += t[k];
    }
    return out;
  };
  const fiz = suma((z) => z.fizyczna);
  const zuz = suma((z) => z.zuzyte);
  const sprzedawalne = suma((z) => z.sprzedawalna);
  const przydz = suma((z) => z.przydzielone);
  const bezTelemetrii = hostujace.filter((w) => !w.zasoby!.zuzyte).length;
  const konta = hostujace.reduce((a, w) => a + w.accounts, 0);
  const wPuli = hostujace.filter((w) => w.acceptsNewAccounts && !w.pozaPula);
  const zmiesciSie = wPuli.reduce((a, w) => a + (w.zasoby!.zapas?.kont ?? 0), 0);
  const cordoned = hostujace.filter((w) => !w.acceptsNewAccounts).length;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-3">
        <Link href="/nodes" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Węzły
        </Link>
      </div>

      <header>
        <h1 className="flex items-center gap-3 text-[28px] lg:text-[34px]">
          <Gauge className="h-7 w-7 text-sky-300" /> Pojemność floty
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          <b className="text-white">Zużycie</b> — ile konta realnie używają teraz (telemetria), wobec sprzętu węzła: tu widać ryzyko
          przeciążenia. <b className="text-white">Sprzedane</b> — suma limitów planów wobec tego, co węzeł może sprzedać (sprzęt ×
          overcommit): tu widać miejsce na nowe konta. Ten sam podział stosuje automatyczny przydział kont.
        </p>
      </header>

      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          <AlertCircle className="h-4 w-4" /> Nie udało się pobrać floty: {error}
        </div>
      )}

      <section className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {WYMIARY.map((d) => (
          <FleetStat
            key={d.k}
            icon={d.ikona}
            label={`${d.nazwa} floty · zużycie`}
            pct={pct(zuz[d.k], fiz[d.k])}
            sub={`sprzedane ${pct(przydz[d.k], sprzedawalne[d.k])}% (${d.fmt(przydz[d.k])} / ${d.fmt(sprzedawalne[d.k])})`}
          />
        ))}
        <div className="rounded-xl border border-white/5 bg-black/30 backdrop-blur-md p-4">
          <p className="text-xs text-muted-foreground">Konta na flocie</p>
          <p className="mt-1 text-2xl font-semibold text-white">{konta}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {wPuli.length === 0
              ? "żaden węzeł nie przyjmuje nowych kont"
              : `~${zmiesciSie} ${plForm(zmiesciSie, "zmieści się", "zmieszczą się", "zmieści się")} w pakiecie standardowym`}
          </p>
        </div>
        <div className="rounded-xl border border-white/5 bg-black/30 backdrop-blur-md p-4">
          <p className="text-xs text-muted-foreground">Cordon (wstrzymane)</p>
          <p className={`mt-1 text-2xl font-semibold ${cordoned > 0 ? "text-amber-300" : "text-white"}`}>{cordoned}</p>
          <p className="text-xs text-muted-foreground mt-1">
            z {nodesLabel(hostujace.length)}
            {bezTelemetrii ? ` · ${bezTelemetrii} bez telemetrii` : ""}
          </p>
        </div>
      </section>

      {hostujace.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-black/30 p-10 text-center text-sm text-muted-foreground">
          Brak węzłów hostujących z zaraportowaną pojemnością.
        </div>
      ) : (
        <section className="space-y-3">
          {hostujace.map((w) => (
            <NodeRow key={w.id} w={w} />
          ))}
        </section>
      )}
    </div>
  );
}

function NodeRow({ w }: { w: Wezel }) {
  const z = w.zasoby!;
  return (
    <Link
      href={`/nodes/${w.id}#hosting-profile`}
      className="block rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md p-5 transition-colors hover:border-white/20"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-white">{w.name}</h3>
          <p className="truncate text-xs text-muted-foreground">
            {w.region ? `${w.region} • ` : ""}
            {w.status}
            {z.zapas ? ` • zmieści jeszcze ~${z.zapas.kont} (ogranicza: ${z.zapas.wymiar})` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!w.acceptsNewAccounts ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-300">
              <Ban className="h-3 w-3" /> cordon
            </span>
          ) : null}
          {w.reservedHeadroomPercent > 0 ? (
            <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-[11px] text-sky-300">
              rezerwa {w.reservedHeadroomPercent}%
            </span>
          ) : null}
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-neutral-300">
            konta: {w.accounts}
            {w.maxAccounts != null ? ` / ${w.maxAccounts}` : ""}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {WYMIARY.map((d) => {
          const oc = z.sprzedawalna[d.k] / z.fizyczna[d.k];
          return (
            <div key={d.k} className="space-y-2">
              <Bar
                label={`${d.nazwa} · zużycie`}
                pct={z.zuzyte ? pct(z.zuzyte[d.k], z.fizyczna[d.k]) : null}
                detail={z.zuzyte ? `${d.fmt(z.zuzyte[d.k])} / ${d.fmt(z.fizyczna[d.k])}` : "brak świeżej telemetrii"}
              />
              <Bar
                label={`${d.nazwa} · sprzedane`}
                pct={pct(z.przydzielone[d.k], z.sprzedawalna[d.k])}
                detail={`${d.fmt(z.przydzielone[d.k])} / ${d.fmt(z.sprzedawalna[d.k])}${oc > 1 ? ` (×${oc.toLocaleString("pl-PL", { maximumFractionDigits: 1 })})` : ""}`}
                muted
              />
            </div>
          );
        })}
      </div>
    </Link>
  );
}

function Bar({ label, pct: value, detail, muted = false }: { label: string; pct: number | null; detail: string; muted?: boolean }) {
  const tone = toneFor(value ?? 0);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className={value == null ? "text-muted-foreground" : tone.text}>{value == null ? "—" : `${value}%`}</span>
      </div>
      <div className={`${muted ? "h-1.5" : "h-2"} w-full overflow-hidden rounded-full bg-white/10`}>
        <div className={`h-full rounded-full ${tone.bg} ${muted ? "opacity-60" : ""}`} style={{ width: `${Math.min(value ?? 0, 100)}%` }} />
      </div>
      <p className="mt-1 text-[11px] text-neutral-500">{detail}</p>
    </div>
  );
}

function FleetStat({ icon, label, pct: value, sub }: { icon: React.ReactNode; label: string; pct: number; sub: string }) {
  const tone = toneFor(value);
  return (
    <div className="rounded-xl border border-white/5 bg-black/30 backdrop-blur-md p-4">
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon} {label}
      </p>
      <p className={`mt-1 text-2xl font-semibold ${tone.text}`}>{value}%</p>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div className={`h-full rounded-full ${tone.bg}`} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
      <p className="mt-1 text-[11px] text-neutral-500">{sub}</p>
    </div>
  );
}

function pct(used: number, total: number): number {
  if (!total || total <= 0) return 0;
  return Math.min(100, Math.round((used / total) * 100));
}

function toneFor(value: number): { text: string; bg: string } {
  if (value >= 90) return { text: "text-rose-300", bg: "bg-rose-500" };
  if (value >= 75) return { text: "text-amber-300", bg: "bg-amber-500" };
  return { text: "text-emerald-300", bg: "bg-emerald-500" };
}

function formatMb(mb: number): string {
  if (!mb) return "0 MB";
  if (mb >= 1024) return `${(mb / 1024).toLocaleString("pl-PL", { maximumFractionDigits: 1 })} GB`;
  return `${Math.round(mb)} MB`;
}
