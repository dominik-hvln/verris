import Link from "next/link";
import { REGIONY_DANYCH, type RegionDanych } from "@verris/contracts";
import { adminApi } from "@/lib/api";
import { plural } from "@/lib/pl";
import { Eyebrow, KARTA, Pigulka } from "@/components/v2";
import { Wykres, type Punkt, type TonWykresu } from "@/components/wykres";
import { Sortowanie } from "./sortowanie";
import { KomentarzPrognozy } from "../[id]/prognoza-wezla";

export const dynamic = "force-dynamic";

type Stan = "krytyczny" | "ostrzezenie" | "norma";

/** Odpowiedź `GET /admin/servers/wykresy` (apps/api/src/servers/wykresy-floty.ts). */
interface WykresyFloty {
  zakres: string;
  od: string;
  do: string;
  kpi: {
    wszystkie: number;
    aktywne: number;
    pozaPula: number;
    cpuSrednie: number | null;
    ramSrednie: number | null;
    cpu: Punkt[];
    ram: Punkt[];
    pojemnosc: { wymiar: string; proc: number } | null;
  };
  wezly: {
    id: string;
    name: string;
    region: string | null;
    status: string;
    stan: Stan;
    accounts: number;
    pozaPula: string | null;
    cpuNow: number | null;
    ramNow: number | null;
    diskPct: number | null;
    lastSignalAt: string | null;
    lastOffsiteBackupAt: string | null;
    cpu: Punkt[];
    ram: Punkt[];
  }[];
}

type LiniaPrognozy = { tekst: string; ton: "warn" | "crit" | null };
/** Odpowiedź `GET /admin/servers/prognoza-floty` (apps/api/src/servers/prognoza-wezla.ts) — tylko pola tej strony. */
interface PrognozaFloty {
  wezly: { id: string; linia: LiniaPrognozy }[];
  podsumowanie: string;
  zalecenia: string[];
  komentarzAi: boolean;
}

const ZAKRESY = [
  { v: "1h", nazwa: "1 h" },
  { v: "24h", nazwa: "24 h" },
  { v: "7d", nazwa: "7 dni" },
];
const STANY: { v: Stan | "wszystkie"; nazwa: string; kropka?: string }[] = [
  { v: "wszystkie", nazwa: "Wszystkie" },
  { v: "norma", nazwa: "W normie", kropka: "bg-data" },
  { v: "ostrzezenie", nazwa: "Ostrzeżenie", kropka: "bg-warn" },
  { v: "krytyczny", nazwa: "Krytyczne", kropka: "bg-crit" },
];
const SORTY = [
  { value: "stan", label: "Stan (najgorsze najpierw)" },
  { value: "cpu", label: "CPU" },
  { value: "ram", label: "Pamięć" },
  { value: "nazwa", label: "Nazwa" },
];
const ETYKIETA: Record<Stan, { tekst: string; kropka: string }> = {
  krytyczny: { tekst: "krytyczny", kropka: "bg-crit" },
  ostrzezenie: { tekst: "ostrzeżenie", kropka: "bg-warn" },
  norma: { tekst: "w normie", kropka: "bg-data" },
};

/** „DE · Falkenstein” z kodu regionu — bez nazwy dostawcy. Nieznany kod pokazujemy tak, jak jest. */
function lokalizacja(region: string | null): string | null {
  const kod = region?.trim().toUpperCase();
  if (!kod) return null;
  const opis = REGIONY_DANYCH[kod as RegionDanych];
  return opis ? `${kod.slice(0, 2)} · ${opis.split(", ")[1]!.replace(/\s*\(.*\)$/, "")}` : region;
}

// Czas żądania (strona dynamiczna) — reguła purity nie przepuszcza Date.now() w ciele komponentu.
const chwila = () => Date.now();

function temu(iso: string | null, teraz: number): string {
  if (!iso) return "brak";
  const s = Math.max(0, Math.round((teraz - Date.parse(iso)) / 1000));
  if (s < 60) return `${s} s temu`;
  if (s < 3600) return `${Math.floor(s / 60)} min temu`;
  if (s < 48 * 3600) return `${Math.floor(s / 3600)} h temu`;
  return `${Math.floor(s / 86400)} dni temu`;
}

const ton = (v: number | null, ostrz: number, kryt: number): TonWykresu | null => (v == null ? null : v >= kryt ? "crit" : v >= ostrz ? "warn" : null);
const TEKST: Record<TonWykresu, string> = { crit: "text-crit", warn: "text-warn", data: "text-foreground", "data-2": "text-foreground" };
const PASEK: Record<TonWykresu, string> = { crit: "bg-crit", warn: "bg-warn", data: "bg-data", "data-2": "bg-data" };

const PRZELACZNIK = "flex flex-wrap gap-1 rounded-[10px] border border-line bg-card p-1";
const OPCJA = "inline-flex min-h-9 items-center gap-2 rounded-[7px] px-3.5 text-[13px]";
const opcja = (on: boolean) => `${OPCJA} ${on ? "bg-raised font-semibold text-foreground" : "font-medium text-muted-foreground hover:text-foreground"}`;

export default async function WykresyWezlowStrona({ searchParams }: { searchParams: Promise<{ zakres?: string; stan?: string; sort?: string }> }) {
  const q = await searchParams;
  const zakres = ZAKRESY.some((z) => z.v === q.zakres) ? q.zakres! : "24h";
  const stan = STANY.some((s) => s.v === q.stan) ? q.stan! : "wszystkie";
  const sort = SORTY.some((s) => s.value === q.sort) ? q.sort! : "stan";
  const href = (z: Partial<{ zakres: string; stan: string; sort: string }>) => {
    const p = { zakres, stan, sort, ...z };
    const qs = new URLSearchParams();
    if (p.zakres !== "24h") qs.set("zakres", p.zakres);
    if (p.stan !== "wszystkie") qs.set("stan", p.stan);
    if (p.sort !== "stan") qs.set("sort", p.sort);
    return `/nodes/wykresy${qs.size ? `?${qs}` : ""}`;
  };

  const [dane, prognoza] = await Promise.all([
    adminApi<WykresyFloty>(`/admin/servers/wykresy?zakres=${zakres}&sort=${sort}`).catch((e: unknown) => (e instanceof Error ? e.message : "błąd")),
    // Prognoza jest dodatkiem — jej brak nie psuje wykresów.
    adminApi<PrognozaFloty>("/admin/servers/prognoza-floty").catch(() => null),
  ]);
  const linie = new Map((prognoza?.wezly ?? []).map((w) => [w.id, w.linia]));
  const teraz = chwila();
  const nazwaZakresu = ZAKRESY.find((z) => z.v === zakres)!.nazwa;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <Eyebrow>Flota · Węzły</Eyebrow>
          <h1 className="text-[32px] lg:text-[34px]">Wykresy węzłów</h1>
          <p className="text-sm text-muted-foreground">CPU i pamięć z telemetrii kont na węźle · próbki co minutę, uśrednione w przedziałach</p>
        </div>
        <nav aria-label="Zakres" className={PRZELACZNIK}>
          {ZAKRESY.map((z) => (
            <Link key={z.v} href={href({ zakres: z.v })} aria-current={z.v === zakres ? "true" : undefined} className={opcja(z.v === zakres)} scroll={false}>
              {z.nazwa}
            </Link>
          ))}
        </nav>
      </div>

      {prognoza ? (
        <section className={`${KARTA} flex flex-col gap-2 px-5 py-[18px]`} aria-labelledby="prognoza-floty">
          <h2 id="prognoza-floty" className="font-display text-[17px] font-bold">
            Prognoza floty
          </h2>
          <KomentarzPrognozy podsumowanie={prognoza.podsumowanie} zalecenia={prognoza.zalecenia} komentarzAi={prognoza.komentarzAi} />
        </section>
      ) : null}

      {typeof dane === "string" ? (
        <div className="rounded-[10px] border border-crit/30 bg-crit/10 px-4 py-3 text-sm text-crit">Nie udało się pobrać wykresów: {dane}</div>
      ) : (
        <Tresc dane={dane} stan={stan} sort={sort} href={href} teraz={teraz} nazwaZakresu={nazwaZakresu} linie={linie} />
      )}
    </div>
  );
}

function Tresc({
  dane,
  stan,
  sort,
  href,
  teraz,
  nazwaZakresu,
  linie,
}: {
  dane: WykresyFloty;
  stan: string;
  sort: string;
  href: (z: Partial<{ zakres: string; stan: string; sort: string }>) => string;
  teraz: number;
  nazwaZakresu: string;
  linie: Map<string, LiniaPrognozy>;
}) {
  const { kpi, od, do: doT } = dane;
  const liczby = dane.wezly.reduce<Record<string, number>>((a, w) => ({ ...a, [w.stan]: (a[w.stan] ?? 0) + 1 }), { wszystkie: dane.wezly.length });
  const widoczne = stan === "wszystkie" ? dane.wezly : dane.wezly.filter((w) => w.stan === stan);
  const kartaKpi = `${KARTA} flex flex-col gap-2 px-5 py-[18px]`;
  const liczba = "font-display text-[30px] font-bold leading-tight tracking-[-0.02em]";
  const poj = kpi.pojemnosc;

  return (
    <>
      <section aria-label="Flota w liczbach" className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <div className={kartaKpi}>
          <span className="text-[12.5px] text-muted-foreground">Aktywne węzły</span>
          <span className={liczba}>
            {kpi.aktywne} <span className="text-[15px] font-semibold text-muted-foreground">z {kpi.wszystkie}</span>
          </span>
          <span className="text-xs text-muted-foreground">{kpi.pozaPula ? `${kpi.pozaPula} poza pulą` : "wszystkie aktywne w puli"}</span>
        </div>
        <div className={kartaKpi}>
          <span className="text-[12.5px] text-muted-foreground">Średnie CPU · {nazwaZakresu}</span>
          <span className={liczba}>{kpi.cpuSrednie == null ? "—" : `${kpi.cpuSrednie}%`}</span>
          <Wykres punkty={kpi.cpu} od={od} do={doT} etykieta={`Średnie CPU floty, ${nazwaZakresu}`} wysokosc={28} obszar={false} />
        </div>
        <div className={kartaKpi}>
          <span className="text-[12.5px] text-muted-foreground">Średnia pamięć · {nazwaZakresu}</span>
          <span className={liczba}>{kpi.ramSrednie == null ? "—" : `${kpi.ramSrednie}%`}</span>
          <Wykres punkty={kpi.ram} od={od} do={doT} etykieta={`Średnia pamięć floty, ${nazwaZakresu}`} ton="data-2" wysokosc={28} obszar={false} />
        </div>
        <div className={kartaKpi}>
          <Link href="/nodes/capacity" className="text-[12.5px] text-muted-foreground hover:text-foreground hover:underline">
            Pojemność floty
          </Link>
          <span className={liczba}>{poj ? `${poj.proc}%` : "—"}</span>
          <span className="block h-2 overflow-hidden rounded-[4px] bg-raised" role="img" aria-label={poj ? `${poj.proc}% sprzedawalnej pojemności` : "brak danych"}>
            <span className={`block h-full ${PASEK[ton(poj?.proc ?? null, 75, 90) ?? "data"]}`} style={{ width: `${Math.min(100, poj?.proc ?? 0)}%` }} />
          </span>
          <span className="text-xs text-muted-foreground">{poj ? `przydzielone kontom vs sprzedawalne · ${poj.wymiar}` : "brak węzłów z zaraportowaną pojemnością"}</span>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <nav aria-label="Stan" className={PRZELACZNIK}>
          {STANY.map((s) => (
            <Link key={s.v} href={href({ stan: s.v })} aria-current={s.v === stan ? "true" : undefined} className={`${opcja(s.v === stan)} text-[13.5px]`} scroll={false}>
              {s.kropka ? <span className={`h-2 w-2 rounded-full ${s.kropka}`} /> : null}
              {s.nazwa}
              <span className="rounded-md bg-background px-[7px] py-px font-mono text-xs">{liczby[s.v] ?? 0}</span>
            </Link>
          ))}
        </nav>
        <Sortowanie wartosc={sort} opcje={SORTY.map((o) => ({ ...o, href: href({ sort: o.value }) }))} />
      </div>

      {widoczne.length === 0 ? (
        <div className={`${KARTA} px-5 py-8 text-sm text-muted-foreground`}>{dane.wezly.length ? "Żaden węzeł nie ma tego stanu." : "Nie masz jeszcze żadnych węzłów."}</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {widoczne.map((w) => {
            const tonCpu = ton(w.cpuNow, 75, 90);
            const tonRam = ton(w.ramNow, 85, 101);
            const tonDysk = ton(w.diskPct, 80, 90);
            const miejsce = lokalizacja(w.region);
            const linia = linie.get(w.id);
            return (
              <article key={w.id} className={`${KARTA} flex flex-col gap-3.5 rounded-[14px] p-[18px]`} aria-labelledby={`wezel-${w.id}`}>
                <div className="flex items-start gap-3">
                  <span className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[10px] border border-line bg-raised text-muted-foreground">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                      <rect x="3" y="4" width="18" height="7" rx="2" />
                      <rect x="3" y="13" width="18" height="7" rx="2" />
                      <path d="M7 7.5h.01M7 16.5h.01" />
                    </svg>
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <Link id={`wezel-${w.id}`} href={`/nodes/${w.id}`} className="truncate font-display text-[17px] font-semibold text-foreground hover:underline">
                      {w.name}
                    </Link>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {miejsce ? <span className="rounded-full border border-line-strong px-2 py-0.5">{miejsce}</span> : null}
                      <span className="inline-flex items-center gap-1.5">
                        <span className={`h-2 w-2 rounded-full ${ETYKIETA[w.stan].kropka}`} />
                        {ETYKIETA[w.stan].tekst}
                      </span>
                      <span>· {plural(w.accounts, "konto", "konta", "kont")}</span>
                      {w.pozaPula ? (
                        <Pigulka ton="warn" kropka={false} className="!px-2 !py-0.5 !text-[11px]">
                          {w.pozaPula.startsWith("poza pulą") ? w.pozaPula : `poza pulą — ${w.pozaPula}`}
                        </Pigulka>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="rounded-[10px] bg-background px-3 pb-1.5 pt-3">
                    <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
                      <span>CPU</span>
                      <span className={`font-mono ${TEKST[tonCpu ?? "data"]}`}>{w.cpuNow == null ? "—" : `${w.cpuNow}%`}</span>
                    </div>
                    <Wykres punkty={w.cpu} od={od} do={doT} etykieta={`CPU ${w.name}, ${nazwaZakresu}`} ton={tonCpu ?? "data"} />
                  </div>
                  <div className="rounded-[10px] bg-background px-3 pb-1.5 pt-3">
                    <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
                      <span>Pamięć</span>
                      <span className={`font-mono ${TEKST[tonRam ?? "data"]}`}>{w.ramNow == null ? "—" : `${w.ramNow}%`}</span>
                    </div>
                    <Wykres punkty={w.ram} od={od} do={doT} etykieta={`Pamięć ${w.name}, ${nazwaZakresu}`} ton={tonRam ?? "data-2"} />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Dysk</span>
                    <span className={`font-mono ${TEKST[tonDysk ?? "data"]}`}>{w.diskPct == null ? "—" : `${w.diskPct}%`}</span>
                  </div>
                  <span className="block h-1.5 overflow-hidden rounded-[3px] bg-raised" role="img" aria-label={w.diskPct == null ? "dysk: brak próbek" : `dysk ${w.diskPct}%`}>
                    <span className={`block h-full ${PASEK[tonDysk ?? "data"]}`} style={{ width: `${Math.min(100, w.diskPct ?? 0)}%` }} />
                  </span>
                  <div className="flex justify-between gap-2 text-[11.5px] text-muted-foreground">
                    <span className={w.status === "ACTIVE" && (!w.lastSignalAt || teraz - Date.parse(w.lastSignalAt) > 15 * 60_000) ? "text-crit" : undefined}>sygnał {temu(w.lastSignalAt, teraz)}</span>
                    <span>kopia off-site {temu(w.lastOffsiteBackupAt, teraz)}</span>
                  </div>
                  {linia ? (
                    <span className={`text-[11.5px] ${linia.ton ? TEKST[linia.ton] : "text-muted-foreground"}`}>prognoza: {linia.tekst}</span>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
