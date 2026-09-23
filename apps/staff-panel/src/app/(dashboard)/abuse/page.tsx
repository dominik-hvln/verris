import Link from "next/link";
import { staffApi, StaffApiError } from "@/lib/staff-api";
import { BRAK_UPRAWNIENIA, KATEGORIA, STATUS_LABEL, STATUS_STYLE } from "./shared";

export const dynamic = "force-dynamic";

type Row = { id: string; status: string; category: string; url: string; host: string; reporterEmail: string; subscriptionId: string | null; userId: string | null; createdAt: string };
const FILTRY = ["", "NEW", "IN_REVIEW", "ACTION_TAKEN", "REJECTED"];

/** N-13 — kolejka zgłoszeń nadużyć (DSA art. 16). Zgłoszenia wpadają z verris.pl/zglos-naduzycie. */
export default async function AbusePage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  let rows: Row[] = [];
  let error: string | null = null;
  try {
    rows = await staffApi<Row[]>(`/staff/abuse${status ? `?status=${encodeURIComponent(status)}` : ""}`);
  } catch (e) {
    error = e instanceof StaffApiError && e.status === 403 ? BRAK_UPRAWNIENIA : "Nie udało się pobrać zgłoszeń.";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Nadużycia</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Zgłoszenia z formularza na verris.pl. Każde dostaje decyzję z uzasadnieniem — zgłaszający dostaje je mailem,
          a klient, gdy ograniczamy jego usługę. Decyduje człowiek, nie automat.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {FILTRY.map((f) => (
          <Link key={f || "all"} href={f ? `/abuse?status=${f}` : "/abuse"}
            className={`rounded-lg border px-3 py-1.5 text-xs ${(status ?? "") === f ? "border-indigo-500/50 bg-indigo-500/15 text-indigo-100" : "border-white/10 bg-black/30 text-muted-foreground hover:border-white/20"}`}>
            {f ? STATUS_LABEL[f] : "Wszystkie"}
          </Link>
        ))}
      </div>
      {error ? (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-white/10 bg-black/30 p-8 text-center text-sm text-muted-foreground">Brak zgłoszeń{status ? ` w statusie „${STATUS_LABEL[status] ?? status}”` : ""}.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <Link key={r.id} href={`/abuse/${r.id}`} className="block rounded-xl border border-white/10 bg-black/30 p-4 hover:border-white/20">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-2 py-0.5 text-[11px] ${STATUS_STYLE[r.status] ?? ""}`}>{STATUS_LABEL[r.status] ?? r.status}</span>
                <span className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-muted-foreground">{KATEGORIA[r.category] ?? r.category}</span>
                <span className="break-all text-white">{r.url}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {new Date(r.createdAt).toLocaleString("pl-PL")} · zgłaszający {r.reporterEmail} · {r.subscriptionId ? "nasza usługa" : r.userId ? "domena klienta" : "nie dopasowano do klienta"}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
