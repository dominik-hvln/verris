import Link from "next/link";
import { Clock, MessageSquare } from "lucide-react";
import { staffListaZgloszen, type ListaZgloszen } from "@/lib/tickets-data";
import { staffListTags } from "@/lib/ticket-actions";
import { StaffApiError } from "@/lib/staff-api";
import { FILTRY, linkStrony, type ParametrySkrzynki } from "@/lib/skrzynka";
import { FiltrySkrzynki, Stronicowanie } from "@/components/filtry-skrzynki";

export const dynamic = "force-dynamic";

/** Zamknięte zgłoszenia. F2.5 — wyszukiwanie, filtry i stronicowanie w API (wcześniej cała tabela). */
export default async function ClosedTicketsPage({ searchParams }: { searchParams: Promise<ParametrySkrzynki> }) {
  const p = await searchParams;
  const filterUserId = p.userId;
  const zapytanie: Record<string, string> = { stan: "zamkniete", sort: "zamkniete", limit: "50" };
  for (const k of FILTRY) if (k !== "sla" && p[k]?.trim()) zapytanie[k] = p[k]!.trim();
  if (p.page && Number(p.page) > 1) zapytanie.page = p.page;

  let lista: ListaZgloszen | null = null;
  let error: string | null = null;
  try {
    lista = await staffListaZgloszen(zapytanie);
  } catch (e) {
    error = e instanceof StaffApiError ? e.message : e instanceof Error ? e.message : "Nie udało się pobrać zgłoszeń.";
  }
  const tagi = (await staffListTags()).map((t) => t.tag);
  const rows = lista?.rows ?? [];

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      {error ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}
      <div>
        <h1 className="text-3xl font-bold text-white">Zamknięte</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Historia zamkniętych zgłoszeń — najnowsze na górze.
          {filterUserId ? (
            <>
              {" "}
              <span className="text-cyan-200/90">Filtrowanie po kliencie.</span>{" "}
              <Link href="/tickets/closed" className="text-cyan-400 hover:underline">
                Wyczyść
              </Link>
              {" · "}
              <Link href={`/crm/${filterUserId}`} className="text-cyan-400 hover:underline">
                Profil
              </Link>
            </>
          ) : null}
        </p>
      </div>
      <FiltrySkrzynki p={p} tagi={tagi} sciezka="/tickets/closed" bezTerminu />
      <div className="rounded-2xl border border-white/10 bg-black/30">
        <ul className="divide-y divide-white/5">
          {rows.map((t) => (
            <li
              key={t.id}
              className="flex flex-wrap items-stretch justify-between gap-2 border-b border-white/5 last:border-0"
            >
              <Link
                href={`/tickets/${t.id}`}
                className="min-w-0 flex-1 px-6 py-4 hover:bg-white/[0.04] text-sm transition-colors text-white"
              >
                <span className="font-medium truncate block flex items-center gap-2">
                  <MessageSquare className="h-3.5 w-3.5 shrink-0 text-neutral-500" />
                  #{t.id.slice(0, 8)} — {t.subject}
                </span>
                <span className="text-muted-foreground text-xs block mt-1">
                  {[t.user.firstName, t.user.lastName].filter(Boolean).join(" ") || t.user.email}
                  {" · "}
                  {t._count.replies} odp.
                </span>
              </Link>
              <div className="flex items-center gap-3 px-4 py-4 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {new Date(t.resolvedAt ?? t.updatedAt ?? t.createdAt).toLocaleString("pl-PL")}
                </span>
                <Link
                  href={`/crm/${t.user.id}`}
                  className="shrink-0 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-neutral-300 hover:bg-white/10"
                >
                  Profil
                </Link>
              </div>
            </li>
          ))}
        </ul>
        {rows.length === 0 ? (
          <div className="py-14 text-center text-muted-foreground text-sm">{error ? 'Nie udało się wczytać zgłoszeń — zobacz komunikat powyżej.' : 'Brak zamkniętych zgłoszeń.'}</div>
        ) : null}
      </div>
      {lista ? <Stronicowanie strona={lista.page} stron={lista.totalPages} razem={lista.total} link={(s) => linkStrony(p, s, "/tickets/closed")} /> : null}
    </div>
  );
}
