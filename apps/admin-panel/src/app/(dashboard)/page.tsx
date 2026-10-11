import { bramkaStrony } from "@/lib/bramka-strony";
import { fetchAdminDashboardOverview } from "@/lib/admin-overview-data";
import { AdminDashboardReal } from "@/components/admin-dashboard-real";
import { PulpitFinansow, PulpitNoc, PulpitObslugi, type PulpitFinansowDane, type PulpitNocDane, type PulpitObslugiDane } from "@/components/pulpity-rol";
import { Eyebrow, Zakladki } from "@/components/v2";
import { Pomoc } from "@/components/pomoc";
import { NieWczytano } from "@/components/nie-wczytano";
import { adminApi } from "@/lib/api";
import { fetchStaffAccess } from "@/lib/staff-access";
import { brakUprawnienia } from "@/lib/akcje/wezel";
import { NAZWY_PULPITOW, dostepnePulpity, pulpitOperatora, type Pulpit } from "@/lib/pulpity";

export const dynamic = "force-dynamic";

const API: Record<Exclude<Pulpit, "admin">, string> = { obsluga: "/admin/pulpit/obsluga", noc: "/admin/pulpit/noc", finanse: "/admin/pulpit/finanse" };

/**
 * F3.9 (OP-07) — pulpit per rola: administrator — „Stan platformy”; konsultant — moje zgłoszenia i SLA; NOC — flota
 * i alerty; Finanse — płatności, KSeF i księgowanie. Wybór wg uprawnień (lib/pulpity.ts), zakładki, gdy pulpitów jest
 * kilka (`?pulpit=`).
 */
export default async function AdminDashboardHomePage({ searchParams }: { searchParams?: Promise<{ pulpit?: string }> }) {
  const bramka = await bramkaStrony("/");
  if (bramka) return bramka;
  const q = (await searchParams) ?? {};
  const dostep = await fetchStaffAccess();
  const pulpit = pulpitOperatora(dostep, q.pulpit) ?? "admin";
  const zakladki = dostepnePulpity(dostep);
  const naglowek =
    zakladki.length > 1 ? (
      <Zakladki etykieta="Pulpity" pozycje={zakladki.map((p) => ({ nazwa: NAZWY_PULPITOW[p], href: p === zakladki[0] && !q.pulpit ? "/" : `/?pulpit=${p}`, on: p === pulpit }))} />
    ) : null;

  if (pulpit !== "admin") {
    let dane: unknown = null;
    try {
      dane = await adminApi(API[pulpit]);
    } catch {
      dane = null;
    }
    return (
      <div className="flex flex-col gap-5">
        <header className="flex flex-col gap-1.5">
          <Eyebrow>Pulpit</Eyebrow>
          <h1 className="flex items-center gap-2 font-display text-[32px] font-extrabold tracking-[-0.03em] lg:text-[40px]">
            {NAZWY_PULPITOW[pulpit]} <Pomoc id="pulpity" />
          </h1>
        </header>
        {naglowek}
        {!dane ? (
          <NieWczytano co="pulpitu" />
        ) : pulpit === "obsluga" ? (
          <PulpitObslugi d={dane as PulpitObslugiDane} />
        ) : pulpit === "noc" ? (
          <PulpitNoc d={dane as PulpitNocDane} />
        ) : (
          <PulpitFinansow d={dane as PulpitFinansowDane} />
        )}
      </div>
    );
  }

  // JSX powstaje POZA try/catch. Wcześniej `return <AdminDashboardReal />` stał
  // wewnątrz try — a to nie chroni przed niczym: React renderuje zwrócony
  // element dopiero po wyjściu z tej funkcji, więc błąd renderu i tak by tędy
  // nie przeszedł. Chroniony ma być wyłącznie fetch, i tylko on jest w try.
  let overview: Awaited<ReturnType<typeof fetchAdminDashboardOverview>> | null = null;
  try {
    overview = await fetchAdminDashboardOverview();
  } catch {
    overview = null;
  }

  if (overview) {
    return (
      <div className="flex flex-col gap-5">
        {naglowek}
        <AdminDashboardReal o={overview} dostep={{ dodajWezel: !brakUprawnienia("ADMIN", dostep), operacjeFloty: !brakUprawnienia("NODES_MANAGE", dostep) }} />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-6 text-sm text-rose-100 space-y-2">
      <p className="font-semibold">Nie udało się wczytać pulpitu.</p>
      <p>
        Sprawdź, czy API Nest działa i czy w `.env.local` jest ustawione `API_URL`
        (np. `http://localhost:3000`).
      </p>
      <p className="text-xs text-rose-200/90">
        Endpoint `GET /admin/dashboard/overview` wymaga roli z uprawnieniem do pulpitu — po zalogowaniu
        cookie `admin_session` musi być ustawiane przez panel.
      </p>
    </div>
  );
}
