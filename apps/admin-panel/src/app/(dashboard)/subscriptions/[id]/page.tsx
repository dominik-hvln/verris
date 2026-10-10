import Link from "next/link";
import { AdminApiError, adminApi } from "@/lib/api";
import { NieWczytano } from "@/components/nie-wczytano";
import { fetchStaffAccess, type StaffAccess } from "@/lib/staff-access";
import { stanUslugi } from "@/lib/stan-uslugi";
import { plForm } from "@/lib/pl";
import { Okruszek } from "@/components/admin-shell";
import { DzialaniaKarty } from "@/components/dzialania-karty";
import { LinkJesli } from "@/components/link-jesli";
import { Eyebrow, KARTA, NaglowekKarty, Pigulka, WIERSZ, Zakladki } from "@/components/v2";
import { dzialaniaObiektu } from "@/lib/akcje/rejestr";
import { brakUprawnienia } from "@/lib/akcje/wezel";
import { AKCJE_USLUGI, SEKCJE_USLUGI, type SekcjaUslugi, type UslugaDlaAkcji } from "@/lib/akcje/usluga";
import { listAdminPlans } from "../../plans/data";
import type { ProvisioningJobRow } from "../../provisioning-queue/data";
import { RetryButton } from "../../provisioning-queue/retry-button";
import { OdrzucButton } from "../../provisioning-queue/odrzuc-button";
import { MigrationRowActions } from "../../migrations/migration-row-actions";
import { statusPl } from "../../migrations/status-pl";
import { InternalMigrationForm } from "./internal-migration-form";
import { PlanChangeForm } from "./plan-change-form";
import { ServiceUsagePanel } from "./usage-panel";
import { DiagnosticsPanel } from "./diagnostics-panel";
import { KontoKlientaPanel } from "./konto-klienta-panel";
import { SuspendForm, ZakonczIUsunForm } from "./suspend-form";
import { RestorePanel } from "./restore-panel";
import { OdtworzenieNaWezlePanel } from "./odtworzenie-na-wezle-panel";

export const dynamic = "force-dynamic";

type SubscriptionDetail = {
  id: string;
  status: string;
  provisioningStage?: string | null;
  serviceTag: string | null;
  interval: string;
  priceAmount: string;
  currency: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  user: { id: string; email: string; firstName: string | null; lastName: string | null };
  plan: { id: string; name: string; slug: string; cpuLimit: number; ramLimitMb: number; diskLimitMb: number };
  account: null | {
    id: string;
    domain: string;
    daUsername: string;
    status: string;
    server: null | { id: string; name: string | null; region: string | null };
  };
  events: Array<{ id: string; type: string; createdAt: string }>;
};

type AdminServerRow = { id: string; name: string | null; region: string | null; status: string };
type MigrationEvent = { id: string; type: string; createdAt: string; details: Record<string, unknown> | null };
type ZlecenieMigracji = {
  id: string;
  subscriptionId: string;
  status: string;
  targetDomain: string | null;
  needsAttention: boolean;
  attentionReason: string | null;
  ticketId: string | null;
  lastError: string | null;
  createdAt: string;
  jobs: Array<{ id: string; kind: string; status: string; attempts: number; maxAttempts: number; sequence: number; lastError: string | null }>;
};

const data = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pl-PL") : "—");
const kiedy = (iso: string) => new Date(iso).toLocaleString("pl-PL");

/**
 * Karta usługi (plan E, patch 9) — zakładki v2 jak karta węzła i klienta, sekcja „Działania” z rejestru
 * lib/akcje/usluga.ts. Ponów / Odrzuć zakładanie (wcześniej tylko w Kolejce zadań) i zlecenia migracji z
 * ponowieniem kroku (wcześniej tylko w Migracjach) są na karcie; klient, węzeł i migracje — linkami.
 */
export default async function AdminSubscriptionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ sekcja?: string }>;
}) {
  const { id } = await params;
  const q = (await searchParams) ?? {};
  const sekcja: SekcjaUslugi = SEKCJE_USLUGI.some((s) => s.klucz === q.sekcja) ? (q.sekcja as SekcjaUslugi) : "przeglad";

  let detail: SubscriptionDetail | null = null;
  let access: StaffAccess | null = null;
  try {
    [detail, access] = await Promise.all([adminApi<SubscriptionDetail>(`/admin/subscriptions/${id}`), fetchStaffAccess()]);
  } catch {
    detail = null;
  }
  if (!detail || !access) {
    return (
      <div className="flex flex-col gap-4">
        <Link href="/subscriptions" className="text-xs text-muted-foreground hover:text-foreground">
          ← Usługi
        </Link>
        <p className="text-sm text-crit">Nie udało się wczytać usługi (sprawdź ID i sesję).</p>
      </div>
    );
  }

  const d = detail;
  const zakladanieNieudane = d.status === "PROVISIONING" && d.provisioningStage === "failed";
  const wezel = d.account?.server ?? null;
  const usluga: UslugaDlaAkcji = {
    id: d.id,
    status: d.status,
    zakladanieNieudane,
    maKonto: !!d.account,
    kontoUsuniete: d.account?.status === "DELETED",
    klientId: d.user.id,
    wezelId: wezel?.id ?? null,
  };
  const baza = `/subscriptions/${d.id}`;
  const nazwa = d.account?.domain ?? d.serviceTag ?? d.plan.name;
  const stan = stanUslugi(d.status, d.provisioningStage);
  const zakonczona = d.status === "CANCELED" || d.status === "EXPIRED";
  const kontoZostalo = !!d.account && d.account.status !== "DELETED";

  // Dane tylko dla otwartej zakładki; brak uprawnienia (403) = null — sekcja mówi, czego brakuje.
  // Fala 1B — przebieg migracji, węzły i plany: 403 = pusta lista jak dotąd, inny błąd = null → „Nie udało się wczytać”.
  const odmowa = <T,>(pusta: T) => (e: unknown) => (e instanceof AdminApiError && e.status === 403 ? pusta : null);
  const [joby, zlecenia, przebieg, servers, plans] = await Promise.all([
    sekcja === "przeglad" && zakladanieNieudane
      ? adminApi<{ rows?: ProvisioningJobRow[] }>(`/admin/provisioning-queue?subscriptionId=${encodeURIComponent(d.id)}`).then((r) => r?.rows ?? [], () => null)
      : [],
    sekcja === "migracje"
      ? adminApi<{ rows?: ZlecenieMigracji[] }>(`/admin/migrations?subscriptionId=${encodeURIComponent(d.id)}`).then((r) => r?.rows ?? [], () => null)
      : [],
    sekcja === "migracje" ? adminApi<MigrationEvent[]>(`/admin/subscriptions/${d.id}/migrations`).then((r) => (Array.isArray(r) ? r : []), odmowa<MigrationEvent[]>([])) : [],
    sekcja === "migracje" || sekcja === "kopie" ? adminApi<AdminServerRow[]>("/admin/servers").then((r) => (Array.isArray(r) ? r : []), odmowa<AdminServerRow[]>([])) : [],
    sekcja === "operacje" ? listAdminPlans().catch(odmowa<Awaited<ReturnType<typeof listAdminPlans>>>([])) : [],
  ]);
  const aktywne = servers?.filter((s) => s.status === "ACTIVE") ?? null;
  // Karta otwiera się z CUSTOMERS_VIEW albo SUBSCRIPTIONS_MANAGE (L1-KARTA) — link tylko do strony, którą operator otworzy.
  const doKlienta = !brakUprawnienia("CUSTOMERS_VIEW", access);
  const doWezla = !brakUprawnienia("NODES_VIEW", access);

  return (
    <div className="flex flex-col gap-5">
      <Okruszek tekst={nazwa} />
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Eyebrow>
            Usługa · {d.plan.name}
            {d.serviceTag ? ` · ${d.serviceTag}` : ""}
          </Eyebrow>
          <h1 className="break-all text-[28px] lg:text-[34px]">{nazwa}</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-verris-body">
            <Pigulka ton={stan.ton} className="!text-xs">
              {stan.t}
            </Pigulka>
            <LinkJesli wolno={doKlienta} href={`/customers/${d.user.id}`} className="font-mono hover:underline">
              {d.user.email}
            </LinkJesli>
            {wezel ? (
              <LinkJesli wolno={doWezla} href={`/nodes/${wezel.id}`} className="text-muted-foreground hover:underline">
                · węzeł {wezel.name ?? wezel.id.slice(0, 8)}
              </LinkJesli>
            ) : null}
          </div>
        </div>
      </div>

      <Zakladki
        etykieta="Sekcje usługi"
        pozycje={SEKCJE_USLUGI.map((s) => ({ nazwa: s.nazwa, href: s.klucz === "przeglad" ? baza : `${baza}?sekcja=${s.klucz}`, on: s.klucz === sekcja }))}
      />

      {sekcja === "przeglad" ? (
        <>
          <section className={`${KARTA} grid grid-cols-1 gap-4 p-5 text-sm md:grid-cols-2`} aria-label="Dane usługi">
            <Para k="Klient">
              <LinkJesli wolno={doKlienta} href={`/customers/${d.user.id}`} className="font-mono hover:underline">
                {d.user.email}
              </LinkJesli>
            </Para>
            <Para k="Stan">{stan.t}</Para>
            <Para k="Plan">
              {d.plan.name} ({d.plan.slug})
            </Para>
            <Para k="Usługa (ID)">
              <span className="font-mono">{d.serviceTag ?? d.account?.daUsername ?? "—"}</span>
            </Para>
            <Para k="Cena">
              {d.priceAmount} {d.currency} / {d.interval}
            </Para>
            <Para k="Okres">
              {data(d.currentPeriodStart)} – {data(d.currentPeriodEnd)}
            </Para>
            <Para k="Konto hostingowe">{d.account ? `${d.account.domain} (${d.account.daUsername})` : "Brak konta"}</Para>
            <Para k="Węzeł">
              {wezel ? (
                <LinkJesli wolno={doWezla} href={`/nodes/${wezel.id}`} className="hover:underline">
                  {wezel.name ?? wezel.id.slice(0, 8)}
                  {wezel.region ? ` · ${wezel.region}` : ""}
                </LinkJesli>
              ) : (
                "—"
              )}
            </Para>
          </section>

          {zakladanieNieudane ? <ZakladaniePanel joby={joby} /> : null}

          <DzialaniaKarty id="dzialania-uslugi" dzialania={dzialaniaObiektu(AKCJE_USLUGI, usluga, access)} />
        </>
      ) : null}

      {sekcja === "konto" ? (
        <>
          <section id="diagnostyka" className="scroll-mt-24">
            <DiagnosticsPanel subscriptionId={d.id} />
          </section>
          {d.account ? (
            <section id="konto-klienta" className="scroll-mt-24">
              <KontoKlientaPanel subscriptionId={d.id} />
            </section>
          ) : (
            <p className="text-sm text-muted-foreground">Usługa nie ma konta hostingowego.</p>
          )}
          {d.account ? <ServiceUsagePanel subscriptionId={d.id} /> : null}
        </>
      ) : null}

      {sekcja === "operacje" ? (
        <>
          <Sekcja id="zawieszenie" tytul={d.status === "SUSPENDED" ? "Odwieszenie usługi" : "Zawieszenie usługi"}>
            <SuspendForm subscriptionId={d.id} status={d.status} domain={d.account?.domain ?? null} />
          </Sekcja>
          {zakonczona && !kontoZostalo ? null : (
            <Sekcja id="zakonczenie" tytul={kontoZostalo ? "Zakończenie usługi i usunięcie konta" : "Zakończenie usługi"}>
              <p className="text-xs text-muted-foreground">
                {zakonczona
                  ? "Usługa jest zakończona — konto zniknie samo po 14 dniach. Tu usuniesz je od razu."
                  : "Bez czekania na koniec okresu i bez 14 dni retencji. Płatność cykliczna kartą jest anulowana."}
              </p>
              <ZakonczIUsunForm subscriptionId={d.id} confirmText={d.account?.domain ?? d.serviceTag ?? d.id} hasAccount={kontoZostalo} />
            </Sekcja>
          )}
          {d.status === "ACTIVE" && d.account ? (
            <Sekcja id="zmiana-planu" tytul="Zmiana planu">
              {plans ? (
                <PlanChangeForm
                  subscriptionId={d.id}
                  currentPlanId={d.plan.id}
                  currentPlanName={d.plan.name}
                  plans={plans.filter((p) => p.isActive).map((p) => ({ id: p.id, name: p.name, slug: p.slug }))}
                  isAdmin
                />
              ) : (
                <NieWczytano co="listy planów" />
              )}
            </Sekcja>
          ) : null}
        </>
      ) : null}

      {sekcja === "migracje" ? (
        <>
          <section id="zlecenia-migracji" className={`${KARTA} scroll-mt-24`} aria-labelledby="zlecenia-migracji-naglowek">
            <NaglowekKarty id="zlecenia-migracji-naglowek" tytul="Zlecenia migracji">
              {d.account && canMigrate(access) ? (
                <Link href={`/migrations/za-klienta?subscriptionId=${d.id}`} className="ml-auto text-[13px] font-semibold text-data-hi hover:underline">
                  Migracja za klienta
                </Link>
              ) : null}
            </NaglowekKarty>
            {zlecenia === null ? (
              <div className={`${WIERSZ} text-sm text-muted-foreground`}>Wymaga MIGRATIONS_MANAGE.</div>
            ) : zlecenia.length === 0 ? (
              <div className={`${WIERSZ} text-sm text-muted-foreground`}>Brak zleceń migracji.</div>
            ) : (
              zlecenia.map((m) => (
                <div key={m.id} className={`${WIERSZ} flex-wrap items-start`} data-migracja={m.id}>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <Link href={`/migrations/${m.id}`} className="font-semibold hover:underline">
                      {m.targetDomain ?? m.id.slice(0, 8)}
                    </Link>
                    <span className="text-[12.5px] text-muted-foreground">
                      {statusPl(m.status)} · {kiedy(m.createdAt)}
                      {m.needsAttention && m.attentionReason ? ` · ${m.attentionReason}` : ""}
                    </span>
                    {m.lastError ? <span className="text-[12.5px] text-crit">{m.lastError}</span> : null}
                  </div>
                  <MigrationRowActions migrationId={m.id} subscriptionId={m.subscriptionId} ticketId={m.ticketId} needsAttention={m.needsAttention} jobs={m.jobs} naKarcieUslugi />
                </div>
              ))
            )}
          </section>

          <Sekcja id="migracja-wewnetrzna" tytul="Migracja na inny węzeł">
            {aktywne ? <InternalMigrationForm subscriptionId={d.id} currentServerId={wezel?.id ?? null} servers={aktywne} /> : <NieWczytano co="listy węzłów" />}
          </Sekcja>

          <section className={KARTA} aria-labelledby="przebieg-migracji">
            <NaglowekKarty id="przebieg-migracji" tytul="Przebieg migracji" />
            {przebieg === null ? <NieWczytano co="przebiegu migracji" /> : null}
            {przebieg?.length === 0 ? <div className={`${WIERSZ} text-sm text-muted-foreground`}>Brak zdarzeń migracji.</div> : null}
            {przebieg?.map((row) => (
              <div key={row.id} className={WIERSZ}>
                <span className="w-[150px] shrink-0 font-mono text-xs text-muted-foreground">{kiedy(row.createdAt)}</span>
                <span className="flex-1 font-mono text-[13px]">{row.type}</span>
                {row.details?.ticketId ? <span className="text-xs text-muted-foreground">zgłoszenie {String(row.details.ticketId).slice(0, 8)}</span> : null}
              </div>
            ))}
          </section>
        </>
      ) : null}

      {sekcja === "kopie" ? (
        d.account ? (
          <>
            <Sekcja id="odtworzenie" tytul="Odtworzenie konta z kopii">
              <RestorePanel subscriptionId={d.id} domain={d.account.domain} />
            </Sekcja>
            <Sekcja id="odtworzenie-na-wezle" tytul="Odtworzenie na innym węźle (awaria węzła)">
              {aktywne ? (
                <OdtworzenieNaWezlePanel subscriptionId={d.id} domain={d.account.domain} currentServerId={wezel?.id ?? null} servers={aktywne} />
              ) : (
                <NieWczytano co="listy węzłów" />
              )}
            </Sekcja>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Usługa nie ma konta hostingowego — nie ma czego odtwarzać.</p>
        )
      ) : null}

      {sekcja === "zdarzenia" ? (
        <section className={KARTA} aria-label="Ostatnie zdarzenia">
          {d.events.length === 0 ? <div className={`${WIERSZ} !border-t-0 text-sm text-muted-foreground`}>Brak zdarzeń.</div> : null}
          {d.events.map((e, i) => (
            <div key={e.id} className={`${WIERSZ} ${i === 0 ? "!border-t-0" : ""}`}>
              <span className="w-[150px] shrink-0 font-mono text-xs text-muted-foreground">{kiedy(e.createdAt)}</span>
              <span className="flex-1 font-mono text-[13px]">{e.type}</span>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}

const canMigrate = (a: StaffAccess) => a.isAdmin || a.permissions.includes("MIGRATIONS_MANAGE");

/** Ponów / Odrzuć zakładanie na karcie (wcześniej tylko w Kolejce zadań). null — brak PROVISIONING_MANAGE. */
function ZakladaniePanel({ joby }: { joby: ProvisioningJobRow[] | null }) {
  const nieudane = joby?.filter((j) => j.failedReason) ?? [];
  return (
    <section id="zakladanie" className={`${KARTA} scroll-mt-24 border-[color-mix(in_srgb,var(--crit)_40%,transparent)]`} aria-labelledby="zakladanie-naglowek">
      <NaglowekKarty id="zakladanie-naglowek" tytul="Zakładanie konta nie powiodło się">
        {joby === null ? null : (
          <Link href="/provisioning-queue?state=failed" className="ml-auto text-[13px] font-semibold text-data-hi hover:underline">
            Kolejka zadań
          </Link>
        )}
      </NaglowekKarty>
      {joby === null ? (
        <div className={`${WIERSZ} text-sm text-muted-foreground`}>Ponowienie wymaga PROVISIONING_MANAGE.</div>
      ) : nieudane.length === 0 ? (
        <div className={`${WIERSZ} text-sm text-muted-foreground`}>Brak nieudanego zadania w kolejce — mogło zostać już odrzucone.</div>
      ) : (
        nieudane.map((j) => (
          <div key={j.id} className={`${WIERSZ} flex-wrap items-start`} data-job={j.id}>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm text-crit [overflow-wrap:anywhere]">{j.failedReason}</span>
              <span className="text-[12.5px] text-muted-foreground">
                {j.attemptsMade} {plForm(j.attemptsMade, "próba", "próby", "prób")}
                {j.failedCategory === "transient" ? " · błąd chwilowy" : j.failedCategory === "permanent" ? " · błąd trwały" : ""}
              </span>
            </div>
            <div className="flex flex-col items-end gap-3">
              <RetryButton jobId={j.id} />
              <OdrzucButton jobId={j.id} />
            </div>
          </div>
        ))
      )}
    </section>
  );
}

function Sekcja({ id, tytul, children }: { id: string; tytul: string; children: React.ReactNode }) {
  return (
    <section id={id} className={`${KARTA} flex scroll-mt-24 flex-col gap-3 p-5`} aria-labelledby={`${id}-naglowek`}>
      <h2 id={`${id}-naglowek`} className="font-display text-[17px] font-bold">
        {tytul}
      </h2>
      {children}
    </section>
  );
}

function Para({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground">{k}</span>
      <span>{children}</span>
    </div>
  );
}
