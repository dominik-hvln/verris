import Link from "next/link";
import type { ReactNode } from "react";
import { SERVICE_EVENT_PL, etykieta } from "@verris/contracts";
import { staffApi, StaffApiError } from "@/lib/staff-api";
import { maUprawnienie, pobierzDostepOperatora } from "@/lib/staff-access";
import { pobierzKopieAction, pobierzZuzycieAction } from "./obsluga-actions";
import { ZasobyPanel } from "./zasoby-panel";
import { KopiePanel } from "./kopie-panel";
import { MigracjaWewnetrznaForm, type WezelDocelowy } from "./migracja-wewnetrzna-form";

type Wezel = WezelDocelowy & { status: string };
type WpisMigracji = { id: string; type: string; createdAt: string; details: Record<string, unknown> | null };

const BRAK = (uprawnienie: string) => `Twoja rola nie ma uprawnienia „${uprawnienie}”. Poproś administratora o jego nadanie.`;

function blad(e: unknown, domyslny: string, uprawnienie: string): string {
  if (e instanceof StaffApiError && e.status === 403) return BRAK(uprawnienie);
  if (e instanceof StaffApiError) return e.message;
  return domyslny;
}

function Sekcja({ tytul, opis, children, ton = "neutral" }: { tytul: string; opis?: string; children: ReactNode; ton?: "neutral" | "rose" }) {
  return (
    <section className={`rounded-2xl border p-4 ${ton === "rose" ? "border-rose-500/20 bg-rose-500/5" : "border-white/10 bg-black/30"}`}>
      <h2 className="text-sm font-bold uppercase tracking-wide text-white">{tytul}</h2>
      {opis ? <p className="mt-1 text-xs text-muted-foreground">{opis}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

/**
 * PB-44 (decyzja 08.10) — sekcje obsługi na karcie usługi: zasoby, kopie z odtwarzaniem, migracja wewnętrzna
 * i historia migracji. Każdy odczyt osobno: błąd jednego (węzeł, 403) to komunikat w jego sekcji, reszta karty działa.
 * Akcje widać tylko z uprawnieniem. Uprawnienia czyta wspólny `pobierzDostepOperatora` (jak karta klienta, PB-46):
 * gdy się nie da — podgląd bez akcji; twarda egzekucja i tak jest w API (403 → komunikat).
 * L1-KARTA: zasoby i historię migracji widzi każdy, kto otworzył kartę (L1); kopie czytane z węzła tylko
 * z SUBSCRIPTIONS_MANAGE lub ACCOUNT_DIAGNOSTICS_VIEW (jak API), odtwarzanie i migracja — z SUBSCRIPTIONS_MANAGE.
 */
export async function ObslugaUslugi({
  subscriptionId,
  userId,
  account,
}: {
  subscriptionId: string;
  userId: string;
  account: { domain: string; serverId: string | null } | null;
}) {
  const [dostep, migracjeR] = await Promise.all([
    pobierzDostepOperatora(),
    Promise.allSettled([staffApi<WpisMigracji[]>(`/admin/subscriptions/${subscriptionId}/migrations`)]).then(([r]) => r),
  ]);
  const mozeZarzadzac = maUprawnienie(dostep, "SUBSCRIPTIONS_MANAGE");
  const widziWezly = maUprawnienie(dostep, "NODES_VIEW");
  const widziKopie = mozeZarzadzac || maUprawnienie(dostep, "ACCOUNT_DIAGNOSTICS_VIEW");

  let zuzycie: Awaited<ReturnType<typeof pobierzZuzycieAction>> | null = null;
  let kopie: Awaited<ReturnType<typeof pobierzKopieAction>> | null = null;
  let wezly: Wezel[] | null = null;
  let bladWezlow: string | null = null;
  if (account) {
    const [z, k, w] = await Promise.allSettled([
      pobierzZuzycieAction(subscriptionId),
      widziKopie ? pobierzKopieAction(subscriptionId) : Promise.resolve(null),
      mozeZarzadzac && widziWezly ? staffApi<Wezel[]>("/admin/servers") : Promise.resolve(null),
    ]);
    zuzycie = z.status === "fulfilled" ? z.value : { ok: false, error: "Nie udało się pobrać zużycia zasobów." };
    kopie = k.status === "fulfilled" ? k.value : { ok: false, error: "Nie udało się pobrać kopii konta z serwera." };
    if (w.status === "fulfilled") wezly = w.value;
    else bladWezlow = blad(w.reason, "Nie udało się pobrać listy węzłów.", "Podgląd węzłów i floty");
  }
  const nazwyWezlow = new Map((wezly ?? []).map((w) => [w.id, w.name ?? w.id]));

  return (
    <>
      {account && zuzycie ? (
        <Sekcja tytul="Zasoby" opis="Zużycie względem limitów konta — ostatnie 24 h, odświeżane co 30 s.">
          <ZasobyPanel subscriptionId={subscriptionId} poczatkowe={zuzycie} />
        </Sekcja>
      ) : null}

      {account && kopie ? (
        <Sekcja tytul="Kopie i odtwarzanie" ton="rose">
          <KopiePanel subscriptionId={subscriptionId} userId={userId} domain={account.domain} poczatkowe={kopie} mozeOdtwarzac={mozeZarzadzac} />
        </Sekcja>
      ) : null}

      {account && mozeZarzadzac ? (
        <Sekcja tytul="Migracja wewnętrzna" opis="Przeniesienie konta na inny węzeł platformy: kopia konta i zgłoszenie dla zespołu technicznego.">
          {!widziWezly ? (
            <p className="text-sm text-amber-200">{BRAK("Podgląd węzłów i floty")} Bez listy węzłów nie wybierzesz celu migracji.</p>
          ) : bladWezlow ? (
            <p className="text-sm text-rose-300">{bladWezlow}</p>
          ) : (
            <MigracjaWewnetrznaForm
              subscriptionId={subscriptionId}
              userId={userId}
              domain={account.domain}
              wezly={(wezly ?? []).filter((w) => w.status === "ACTIVE" && w.id !== account.serverId)}
            />
          )}
        </Sekcja>
      ) : null}

      <Sekcja tytul="Historia migracji">
        {migracjeR.status === "rejected" ? (
          <p className="text-sm text-rose-300">{blad(migracjeR.reason, "Nie udało się pobrać historii migracji.", "Subskrypcje i usługi")}</p>
        ) : migracjeR.value.length === 0 ? (
          <p className="text-sm text-muted-foreground">Brak zdarzeń migracji.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {migracjeR.value.map((m) => {
              const d = m.details ?? {};
              const cel = typeof d.targetServerId === "string" ? (nazwyWezlow.get(d.targetServerId) ?? d.targetServerId) : null;
              return (
                <li key={m.id} className="py-2 text-xs">
                  <p className="text-white">
                    {etykieta(SERVICE_EVENT_PL, m.type)} <span className="font-mono text-[10px] text-neutral-500">{m.type}</span>
                  </p>
                  <p className="text-muted-foreground">{new Date(m.createdAt).toLocaleString("pl-PL")}</p>
                  {cel ? <p className="text-neutral-400">Węzeł docelowy: {cel}</p> : null}
                  {typeof d.notes === "string" && d.notes ? <p className="text-neutral-400">Powód: {d.notes}</p> : null}
                  {typeof d.error === "string" && d.error ? <p className="text-rose-300">{d.error}</p> : null}
                  {typeof d.ticketId === "string" ? (
                    <Link href={`/tickets/${d.ticketId}`} className="text-cyan-300 hover:underline">
                      Zgłoszenie
                    </Link>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Sekcja>
    </>
  );
}
