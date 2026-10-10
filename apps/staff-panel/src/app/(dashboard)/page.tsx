import Link from "next/link";
import { redirect } from "next/navigation";
import { staffListaZgloszen, type ListaZgloszen, type StaffTicketRow } from "@/lib/tickets-data";
import { staffListTags } from "@/lib/ticket-actions";
import { WIDOKI, czyFiltry, linkStrony, widokZ, zapytanieSkrzynki, type ParametrySkrzynki } from "@/lib/skrzynka";
import { FiltrySkrzynki, Stronicowanie } from "@/components/filtry-skrzynki";
import { StaffApiError } from "@/lib/staff-api";
import { requireStaffSession } from "@/lib/staff-session";
import { TICKET_DEPARTMENT_PL, TICKET_STATUS_PL, etykieta } from "@verris/contracts";

export const dynamic = "force-dynamic";

const PRIORYTET: Record<string, string> = { URGENT: "Pilny", HIGH: "Wysoki", NORMAL: "Normalny", LOW: "Niski" };

function doTerminu(t: StaffTicketRow, teraz: number): { tekst: string; ton: "crit" | "warn" | "neu" | "ok" } {
  if (t.status === "WAITING_CUSTOMER") return { tekst: "czeka na klienta", ton: "neu" };
  if (!t.firstResponseAt && t.slaResponseDueAt) {
    const min = Math.round((new Date(t.slaResponseDueAt).getTime() - teraz) / 60000);
    if (min < 0) return { tekst: `1. odpowiedź ${fmtMin(-min)} po terminie`, ton: "crit" };
    return { tekst: `1. odpowiedź za ${fmtMin(min)}`, ton: min < 60 ? "warn" : "ok" };
  }
  if (t.lastReplyIsStaff === false) return { tekst: "klient odpisał", ton: "warn" };
  return { tekst: "w toku", ton: "ok" };
}

function fmtMin(m: number): string {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h} h ${m % 60} min` : `${Math.floor(h / 24)} dni`;
}

const TON: Record<string, string> = {
  crit: "bg-[color-mix(in_srgb,var(--crit)_12%,transparent)] text-crit",
  warn: "bg-warn-soft text-warn",
  neu: "bg-raised text-[color:var(--verris-body)]",
  ok: "bg-data-soft text-data-hi",
};

/**
 * Skrzynka obsługi. F2.5 — filtry, wyszukiwanie i stronicowanie liczy API (wcześniej cała tabela zgłoszeń
 * do panelu i sortowanie tutaj); kolejność „po terminie najpierw” też z API.
 */
export default async function StaffInboxPage({ searchParams }: { searchParams: Promise<ParametrySkrzynki> }) {
  const p = await searchParams;
  const filterUserId = p.userId;
  const widok = widokZ(p.widok);
  await requireStaffSession();

  let lista: ListaZgloszen | null = null;
  let error: string | null = null;
  try {
    lista = await staffListaZgloszen(zapytanieSkrzynki(p));
  } catch (e) {
    if (e instanceof StaffApiError && e.status === 401) redirect("/login");
    error = e instanceof Error ? e.message : "Nie udało się pobrać zgłoszeń.";
  }
  const tagi = (await staffListTags()).map((t) => t.tag);
  const rows: StaffTicketRow[] = lista?.rows ?? [];

  // eslint-disable-next-line react-hooks/purity -- komponent serwerowy (force-dynamic) renderuje się raz na żądanie; czas żądania jest tu zamierzony
  const teraz = Date.now();
  const poTerminie = lista?.liczby.poTerminie ?? 0;

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <p role="alert" className="rounded-[10px] border border-crit/30 bg-[color-mix(in_srgb,var(--crit)_10%,transparent)] px-4 py-3 text-sm text-crit">
          {error}
        </p>
      ) : null}

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Obsługa · zgłoszenia</span>
          <h1 className="font-display text-[30px] font-extrabold tracking-[-0.02em]">{WIDOKI[widok].tytul}</h1>
          <p className="text-sm text-muted-foreground">
            {filterUserId ? (
              <>
                Tylko zgłoszenia wybranego klienta ·{" "}
                <Link href="/">Wyczyść filtr</Link> · <Link href={`/crm/${filterUserId}`}>Karta klienta</Link>
              </>
            ) : (
              WIDOKI[widok].opis
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={filterUserId ? `/tickets/nowe?userId=${encodeURIComponent(filterUserId)}` : "/tickets/nowe"}
            className="inline-flex h-[38px] items-center rounded-[9px] border border-line-strong bg-card px-3.5 text-sm font-semibold text-foreground no-underline hover:border-primary"
          >
            Nowe zgłoszenie
          </Link>
          <Licznik etykieta={widok === "wszystkie" && !czyFiltry(p) ? "Otwarte" : "Na liście"} wartosc={lista?.total ?? 0} />
          <Link href={linkStrony({ widok: p.widok, userId: p.userId, sla: "po-terminie" }, 1)} className="no-underline" title="Pokaż tylko po terminie">
            <Licznik etykieta="Po terminie" wartosc={poTerminie} alarm={poTerminie > 0} />
          </Link>
        </div>
      </header>

      <FiltrySkrzynki p={p} tagi={tagi} />

      <section className="overflow-hidden rounded-[10px] border border-line bg-card" aria-label="Lista zgłoszeń">
        {rows.map((t) => {
          const termin = doTerminu(t, teraz);
          const klient = [t.user.firstName, t.user.lastName].filter(Boolean).join(" ") || t.user.email;
          return (
            <div key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line px-4 py-3 first:border-t-0 hover:bg-raised">
              <Link href={`/tickets/${t.id}`} className="flex min-w-0 flex-1 basis-[320px] flex-col gap-0.5 text-foreground no-underline">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">#{t.id.slice(0, 8)}</span>
                  <span className="text-[15px] font-semibold">{t.subject}</span>
                  {t.topic === "BETA" ? <span className="rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-semibold text-warn">Beta</span> : null}
                  {(t.tags ?? []).map((tag) => (
                    <span key={tag} className="rounded-full bg-raised px-2 py-0.5 text-[11px] font-semibold text-[color:var(--verris-body)]">
                      {tag}
                    </span>
                  ))}
                </span>
                <span className="text-[13px] text-muted-foreground">
                  {t.user.companyName ? `${t.user.companyName} · ` : ""}
                  {klient} · {etykieta(TICKET_DEPARTMENT_PL, t.department)} · {PRIORYTET[t.priority] ?? t.priority}
                </span>
              </Link>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-semibold ${TON[termin.ton]}`}>
                <span className="h-[7px] w-[7px] rounded-full bg-current" aria-hidden />
                {termin.tekst}
              </span>
              <span className="w-[130px] text-[13px] text-muted-foreground">
                {etykieta(TICKET_STATUS_PL, t.status)}
                <br />
                {t.assignedTo ? [t.assignedTo.firstName, t.assignedTo.lastName?.[0] ? `${t.assignedTo.lastName[0]}.` : ""].filter(Boolean).join(" ") : "bez opiekuna"}
              </span>
              <span className="w-[112px] text-right font-mono text-[12px] text-muted-foreground">
                {new Date(t.createdAt).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                <br />
                {t._count.replies} wiad.
              </span>
              <Link href={`/crm/${t.user.id}`} className="rounded-[7px] border border-line-strong bg-card px-2.5 py-1 text-[12.5px] font-semibold text-foreground no-underline hover:border-primary">
                Karta klienta
              </Link>
            </div>
          );
        })}
        {rows.length === 0 ? (
          <p className="px-6 py-16 text-center text-sm text-muted-foreground">
            {error ? "Nie udało się wczytać zgłoszeń — zobacz komunikat powyżej." : czyFiltry(p) ? "Nic nie pasuje do filtrów." : "Nic tu nie czeka — wszystko obsłużone."}
          </p>
        ) : null}
      </section>
      {lista ? <Stronicowanie strona={lista.page} stron={lista.totalPages} razem={lista.total} link={(s) => linkStrony(p, s)} /> : null}
    </div>
  );
}

function Licznik({ etykieta: e, wartosc, alarm }: { etykieta: string; wartosc: number; alarm?: boolean }) {
  return (
    <div className="flex min-w-[104px] flex-col rounded-[10px] border border-line bg-card px-4 py-2.5">
      <span className={`font-display text-[26px] font-extrabold leading-none ${alarm ? "text-crit" : ""}`}>{wartosc}</span>
      <span className="mt-1 font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground">{e}</span>
    </div>
  );
}
