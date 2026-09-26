import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { fetchServer } from "../actions";
import { ApproveServerButton } from "./approve-button";
import { BootstrapScriptPanel } from "./bootstrap-script-panel";
import { NodeBootstrapProgress } from "./node-bootstrap-progress";
import { DirectAdminConfigForm } from "./directadmin-form";
import { HostingProfilePanel } from "./hosting-profile-panel";
import { NodeStackReadinessPanel } from "./node-stack-readiness-panel";
import { DbUpgradePanel } from "./db-upgrade-panel";
import { WafPanel } from "./waf-panel";
import { MaintenanceToggle } from "./maintenance-toggle";
import { NodeStatusPanel } from "./node-status-panel";
import { CapacityPolicyPanel } from "./capacity-policy-panel";
import { DrainPanel } from "./drain-panel";
import { NodeAuditPanel } from "./node-audit-panel";
import { NodeInsightsPanel } from "./node-insights-panel";
import { NameserversForm } from "./nameservers-form";
import { RegionForm } from "./region-form";
import { DaSsoButton } from "./da-sso-button";
import { NoweKontaButton } from "./nowe-konta-button";
import { AktualizujWezelButton } from "./aktualizuj-wezel-button";
import { WezelPrzeglad } from "./wezel-przeglad";
import { fetchPrzegladWezla } from "./przeglad-data";
import { listNodeTasks } from "../../provisioning-queue/data";
import { NodeTasksSection } from "../../provisioning-queue/node-tasks-section";
import { Okruszek } from "@/components/admin-shell";
import { Eyebrow, KARTA, Kpi, Pasek, Pigulka, RzadKpi, Zakladki } from "@/components/v2";

export const dynamic = "force-dynamic";

const SEKCJE = ["przeglad", "konta", "audyt", "zadania", "aktualizacje", "konfiguracja", "wycofanie"] as const;
type Sekcja = (typeof SEKCJE)[number];

const STATUS: Record<string, string> = {
  ACTIVE: "Aktywny",
  INIT: "Zakładanie",
  PENDING_APPROVAL: "Czeka na zatwierdzenie",
  MAINTENANCE: "Serwis",
  OFFLINE: "Offline",
  DEPROVISIONING: "Wycofywany",
};

/** MB → „41 GB” / „1,2 TB” (jak w makiecie). */
function rozmiar(mb: number | null | undefined, jednostka?: "GB" | "TB"): string {
  if (mb == null) return "—";
  const tb = (jednostka ?? (mb >= 1024 * 1024 ? "TB" : "GB")) === "TB";
  const v = mb / 1024 / (tb ? 1024 : 1);
  return v.toLocaleString("pl-PL", { maximumFractionDigits: v < 10 ? 1 : 0 });
}
const jednostkaDla = (mb: number | null | undefined) => (mb != null && mb >= 1024 * 1024 ? "TB" : "GB");
const proc = (a: number | null | undefined, b: number | null | undefined) => (a != null && b ? Math.min(100, Math.round((a / b) * 100)) : 0);

export default async function ServerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sekcja?: string }>;
}) {
  const { id } = await params;
  const q = await searchParams;
  const sekcja: Sekcja = (SEKCJE as readonly string[]).includes(q.sekcja ?? "") ? (q.sekcja as Sekcja) : "przeglad";
  const [{ data: server, error }, p] = await Promise.all([fetchServer(id), fetchPrzegladWezla(id)]);
  if (!server) {
    if (error?.toLowerCase().includes("not found")) notFound();
    return (
      <div className="space-y-4">
        <Link href="/nodes" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Wróć do listy
        </Link>
        <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
          <AlertCircle className="h-4 w-4" /> {error ?? "Nie znaleziono węzła"}
        </div>
      </div>
    );
  }

  const isPending = server.status === "PENDING_APPROVAL";
  const canBootstrap = server.status === "INIT" || server.status === "PENDING_APPROVAL";
  const dziala = server.status === "ACTIVE" || server.status === "MAINTENANCE";
  const baza = `/nodes/${server.id}`;
  const nazwa = p?.nazwa ?? server.name ?? server.ipAddress;
  const z = p?.zasoby;
  const zadania = sekcja === "zadania" ? await listNodeTasks(undefined, server.id).catch(() => []) : [];

  return (
    <div className="flex flex-col gap-5">
      <Okruszek tekst={nazwa} mono />
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <Eyebrow>
            Węzeł{server.region ? ` · ${server.region}` : ""} · {server.status === "INIT" ? "czeka na pierwsze połączenie" : server.ipAddress}
          </Eyebrow>
          {/* styl inline: reguła `.v2-skin h1` narzuca krój nagłówków, a makieta ma tu nazwę węzła monospace */}
          <h1 className="break-all text-[30px] tracking-[-0.02em] lg:text-[38px]" style={{ fontFamily: "var(--font-mono)", fontWeight: 500 }}>
            {nazwa}
          </h1>
          <div className="flex flex-wrap items-center gap-2.5 text-[15px] text-verris-body">
            {p ? (
              <Pigulka ton={p.stan === "crit" ? "crit" : p.poza || p.stan === "warn" ? "warn" : "ok"}>
                {STATUS[p.status] ?? p.status} · {p.poza ?? (p.stan === "crit" ? "brak sygnału" : p.stan === "warn" ? "wysokie obciążenie CPU" : "przyjmuje konta")}
              </Pigulka>
            ) : (
              <Pigulka ton="muted">{STATUS[server.status] ?? server.status}</Pigulka>
            )}
            {p ? (
              <span className="text-muted-foreground">
                {[
                  p.wersje.cloudlinux ? `CloudLinux ${p.wersje.cloudlinux}` : "CloudLinux — brak raportu",
                  p.wersje.directadmin ? `DirectAdmin ${p.wersje.directadmin}` : null,
                  `manifest ${p.wersje.manifest ?? "—"}${p.wersje.manifest && p.wersje.manifest !== p.manifestFloty ? ` (flota: ${p.manifestFloty})` : ""}`,
                  `sygnał ${p.sygnal}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            ) : null}
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2.5">
          {isPending && <ApproveServerButton serverId={server.id} />}
          <DaSsoButton
            serverId={server.id}
            sshHost={server.hostname ?? server.ipAddress ?? null}
            daGotowe={Boolean(server.daHost)}
            srodek={dziala ? <NoweKontaButton serverId={server.id} przyjmuje={server.acceptsNewAccounts} /> : null}
          />
        </div>
      </div>

      {z ? (
        <RzadKpi etykieta="Zasoby węzła">
          <Kpi
            etykieta="CPU realne"
            wartosc={z.cpu.proc ?? "—"}
            jednostka={z.cpu.rdzenie ? `% z ${z.cpu.rdzenie} rdzeni` : "% — brak liczby rdzeni"}
            opis={z.cpu.proc == null ? "brak próbek z ostatnich 10 min" : `sprzedane ${z.cpu.sprzedane?.toLocaleString("pl-PL") ?? "—"}× · limit ${z.cpu.limit.toLocaleString("pl-PL")}×`}
          >
            <Pasek proc={z.cpu.proc ?? 0} ton={(z.cpu.proc ?? 0) >= 60 ? "warn" : "ok"} />
          </Kpi>
          <Kpi
            etykieta="RAM"
            wartosc={rozmiar(z.ram.uzyteMb, jednostkaDla(z.ram.razemMb))}
            jednostka={`/ ${rozmiar(z.ram.razemMb)} ${jednostkaDla(z.ram.razemMb)}`}
            opis={`rezerwa na autoskalowanie ${z.ram.rezerwaProc}%`}
          >
            <Pasek proc={proc(z.ram.uzyteMb, z.ram.razemMb)} />
          </Kpi>
          <Kpi
            etykieta="Dysk"
            wartosc={rozmiar(z.dysk.uzyteMb, jednostkaDla(z.dysk.razemMb))}
            jednostka={`/ ${rozmiar(z.dysk.razemMb)} ${jednostkaDla(z.dysk.razemMb)}`}
            opis={`przydzielone kontom ${rozmiar(z.dysk.przydzieloneMb)} ${jednostkaDla(z.dysk.przydzieloneMb)}`}
          >
            <Pasek proc={proc(z.dysk.uzyteMb, z.dysk.razemMb)} />
          </Kpi>
          <Kpi
            etykieta="Konta"
            wartosc={z.konta.razem}
            jednostka={z.konta.limit ? `/ ${z.konta.limit}` : "bez limitu"}
            opis={`${z.konta.autoskalowane} z autoskalowaniem teraz`}
          >
            <Pasek proc={z.konta.limit ? proc(z.konta.razem, z.konta.limit) : 0} />
          </Kpi>
        </RzadKpi>
      ) : (
        <div className={`${KARTA} p-4 text-sm text-muted-foreground`}>Nie udało się wczytać zasobów węzła z API.</div>
      )}

      <Zakladki
        etykieta="Sekcje węzła"
        pozycje={[
          { nazwa: "Przegląd", href: baza, on: sekcja === "przeglad" },
          { nazwa: `Konta (${server._count?.accounts ?? 0})`, href: `${baza}?sekcja=konta`, on: sekcja === "konta" },
          { nazwa: "Audyt i naprawa", href: `${baza}?sekcja=audyt`, on: sekcja === "audyt", licznik: p?.doNaprawy },
          { nazwa: "Zadania", href: `${baza}?sekcja=zadania`, on: sekcja === "zadania" },
          { nazwa: "Aktualizacje", href: `${baza}?sekcja=aktualizacje`, on: sekcja === "aktualizacje" },
          { nazwa: "Konfiguracja", href: `${baza}?sekcja=konfiguracja`, on: sekcja === "konfiguracja" },
          { nazwa: "Wycofanie węzła", href: `${baza}?sekcja=wycofanie`, on: sekcja === "wycofanie" },
        ]}
      />

      {sekcja === "przeglad" ? (
        <>
          {canBootstrap && (
            <section id="bootstrap" className="flex flex-col gap-3">
              <BootstrapScriptPanel serverId={server.id} />
              <h2 className="font-display text-lg font-bold">Instalacja węzła (bootstrap v2)</h2>
              <p className="text-xs text-muted-foreground">
                Ten sam krok co „Instalacja” w{" "}
                <Link href={`/nodes/wizard?server=${server.id}&step=bootstrap`} className="underline">
                  kreatorze węzła
                </Link>{" "}
                — kreator prowadzi dalej przez akceptację, backup offsite, Onboard LIVE i profil hostingowy.
              </p>
              <NodeBootstrapProgress serverId={server.id} />
            </section>
          )}
          {p ? <WezelPrzeglad p={p} bazaHref={baza} /> : null}
        </>
      ) : null}

      {sekcja === "konta" ? <NodeInsightsPanel serverId={server.id} /> : null}

      {sekcja === "audyt" ? (
        dziala ? (
          <>
            <NodeAuditPanel serverId={server.id} serverName={server.name} />
            <NodeStackReadinessPanel serverId={server.id} serverStatus={server.status} />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Audyt i naprawa są dostępne, gdy węzeł jest aktywny albo w serwisie.</p>
        )
      ) : null}

      {sekcja === "zadania" ? <NodeTasksSection rows={zadania} /> : null}

      {sekcja === "aktualizacje" ? (
        <>
          {dziala ? <AktualizujWezelButton serverId={server.id} /> : null}
          {dziala ? (
            <DbUpgradePanel
              serverId={server.id}
              dbEngine={server.dbEngine}
              dbVersion={server.dbVersion}
              targetDbVersion={server.targetDbVersion}
              dbUpgradeRequestedAt={server.dbUpgradeRequestedAt}
            />
          ) : null}
          <HostingProfilePanel serverId={server.id} serverStatus={server.status} />
        </>
      ) : null}

      {sekcja === "konfiguracja" ? (
        <>
          <section className={`${KARTA} flex flex-col gap-2 p-5`} aria-label="Tożsamość węzła">
            <h2 className="font-display text-[17px] font-bold">Tożsamość węzła</h2>
            <DefRow label="ID" value={<code className="font-mono text-xs">{server.id}</code>} />
            <DefRow label="Hostname" value={server.hostname ?? "—"} />
            <DefRow label="Agent" value={server.agentVersion ?? "—"} />
            <DefRow label="Ostatni handshake" value={server.lastHandshakeAt ? new Date(server.lastHandshakeAt).toLocaleString("pl-PL") : "brak"} />
            {server.notes && <DefRow label="Notatki" value={server.notes} />}
          </section>
          <NodeStatusPanel serverId={server.id} status={server.status} />
          <MaintenanceToggle
            serverId={server.id}
            status={server.status}
            maintenanceReason={server.maintenanceReason}
            maintenanceStartedAt={server.maintenanceStartedAt}
          />
          {dziala && (
            <CapacityPolicyPanel
              serverId={server.id}
              acceptsNewAccounts={server.acceptsNewAccounts}
              maxAccounts={server.maxAccounts}
              reservedHeadroomPercent={server.reservedHeadroomPercent}
              overcommitCpu={server.overcommitCpu}
              overcommitRam={server.overcommitRam}
              overcommitDisk={server.overcommitDisk}
              accountCount={server._count?.accounts ?? 0}
            />
          )}
          <div id="directadmin">
            <DirectAdminConfigForm
              serverId={server.id}
              initial={{
                daHost: server.daHost ?? "",
                daPort: server.daPort ?? 2222,
                daUsername: server.daUsername ?? "",
                daUseTls: server.daUseTls,
                daAllowInvalidCert: server.daAllowInvalidCert ?? false,
                daPasswordSet: server.daPasswordSet,
              }}
            />
          </div>
          <div id="nameservers">
            <NameserversForm serverId={server.id} />
          </div>
          <RegionForm serverId={server.id} region={server.region ?? null} />
          <div id="waf">
            <WafPanel serverId={server.id} />
          </div>
        </>
      ) : null}

      {sekcja === "wycofanie" ? (
        dziala ? (
          <DrainPanel serverId={server.id} acceptsNewAccounts={server.acceptsNewAccounts} />
        ) : (
          <p className="text-sm text-muted-foreground">Wycofanie (przeniesienie kont na inne węzły) jest dostępne dla węzła aktywnego albo w serwisie.</p>
        )
      ) : null}
    </div>
  );
}

function DefRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm border-b border-white/5 pb-2 last:border-0 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right text-white truncate min-w-0">{value}</span>
    </div>
  );
}

