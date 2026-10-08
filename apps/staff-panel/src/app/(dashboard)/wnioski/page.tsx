import Link from "next/link";
import { redirect } from "next/navigation";
import { StaffApiError, staffApi } from "@/lib/staff-api";
import type { Wniosek } from "@/lib/wnioski-actions";
import { plural } from "@/lib/pl";
import { DecyzjaWniosku, WycofajWniosek } from "./akcje-wniosku";

export const dynamic = "force-dynamic";

const STATUS_PL: Record<Wniosek["status"], string> = {
  PENDING: "Czeka na decyzję",
  APPROVED: "Zaakceptowany",
  REJECTED: "Odrzucony",
  CANCELLED: "Wycofany",
  FAILED: "Nie wykonano",
};
const STATUS_KOLOR: Record<Wniosek["status"], string> = {
  PENDING: "border-amber-400/40 text-amber-200",
  APPROVED: "border-emerald-500/40 text-emerald-200",
  REJECTED: "border-rose-500/40 text-rose-200",
  CANCELLED: "border-white/15 text-neutral-400",
  FAILED: "border-rose-500/40 text-rose-200",
};

const wnioski = (n: number) => plural(n, "wniosek", "wnioski", "wniosków");
const data = (iso: string) => new Date(iso).toLocaleString("pl-PL");

async function lista(sciezka: string): Promise<{ wiersze: Wniosek[]; blad: string | null }> {
  try {
    return { wiersze: await staffApi<Wniosek[]>(sciezka), blad: null };
  } catch (e) {
    if (e instanceof StaffApiError && e.status === 401) redirect("/login");
    return { wiersze: [], blad: e instanceof StaffApiError && e.status === 403 ? null : "Nie udało się pobrać wniosków — spróbuj odświeżyć." };
  }
}

function Karta({ w, akcje }: { w: Wniosek; akcje?: React.ReactNode }) {
  return (
    <li className="space-y-2 px-4 py-4 text-sm" data-wniosek-id={w.id}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-white">{w.etykieta}</p>
        <span className={`rounded border px-2 py-0.5 text-[11px] ${STATUS_KOLOR[w.status]}`}>{STATUS_PL[w.status]}</span>
      </div>
      <p className="text-neutral-200">{w.opis}</p>
      <p className="text-xs text-muted-foreground">
        {w.klient ? (
          <>
            Klient:{" "}
            <Link href={`/crm/${w.klient.id}`} className="text-cyan-300 hover:underline">
              {w.klient.nazwa ?? w.klient.email}
            </Link>{" "}
            ·{" "}
          </>
        ) : null}
        Wnioskuje: {w.wnioskujacy.nazwa ?? "—"} · {data(w.utworzono)}
      </p>
      <p className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-neutral-300">Uzasadnienie: {w.uzasadnienie}</p>
      {w.decydujacy ? (
        <p className="text-xs text-muted-foreground">
          Decyzja: {w.decydujacy.nazwa ?? "—"}
          {w.rozstrzygnieto ? ` · ${data(w.rozstrzygnieto)}` : ""}
          {w.powodDecyzji ? ` · powód: ${w.powodDecyzji}` : ""}
        </p>
      ) : null}
      {w.wynik?.komunikat ? <p className="text-xs text-emerald-300">{w.wynik.komunikat}</p> : null}
      {w.wynik?.blad ? <p className="text-xs text-rose-300">Nie wykonano: {w.wynik.blad}</p> : null}
      {akcje}
    </li>
  );
}

/**
 * PB-48 — wnioski o operację wymagającą wyższego uprawnienia: „Do decyzji” (REQUESTS_APPROVE — tylko typy,
 * do których masz uprawnienie operacji) i „Moje” (status, wycofanie).
 */
export default async function WnioskiPage({ searchParams }: { searchParams: Promise<{ zakladka?: string }> }) {
  const { zakladka } = await searchParams;
  const dostep = await staffApi<{ isAdmin?: boolean; permissions?: string[] }>("/staff/me/access").catch(() => null);
  const mozeDecydowac = Boolean(dostep?.isAdmin || dostep?.permissions?.includes("REQUESTS_APPROVE"));
  const aktywna = zakladka === "moje" || !mozeDecydowac ? "moje" : "do-decyzji";

  const [doDecyzji, moje] = await Promise.all([
    mozeDecydowac ? lista("/admin/wnioski/do-decyzji") : Promise.resolve({ wiersze: [] as Wniosek[], blad: null }),
    lista("/admin/wnioski/moje"),
  ]);
  const biezaca = aktywna === "moje" ? moje : doDecyzji;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-white">Wnioski</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Operacje, do których rola nie ma uprawnienia, zlecasz wnioskiem z karty klienta. Akceptujący wykonuje je ze swoim
          uprawnieniem; w dzienniku zapisują się obie osoby.
        </p>
      </header>

      <nav className="flex gap-2" aria-label="Zakładki wniosków">
        {mozeDecydowac ? (
          <Link
            href="/wnioski"
            aria-current={aktywna === "do-decyzji" ? "page" : undefined}
            className={`rounded-lg border px-3 py-1.5 text-sm ${aktywna === "do-decyzji" ? "border-cyan-500/40 bg-cyan-500/15 text-white" : "border-white/10 text-neutral-300"}`}
          >
            Do decyzji ({doDecyzji.wiersze.length})
          </Link>
        ) : null}
        <Link
          href="/wnioski?zakladka=moje"
          aria-current={aktywna === "moje" ? "page" : undefined}
          className={`rounded-lg border px-3 py-1.5 text-sm ${aktywna === "moje" ? "border-cyan-500/40 bg-cyan-500/15 text-white" : "border-white/10 text-neutral-300"}`}
        >
          Moje ({moje.wiersze.length})
        </Link>
      </nav>

      {biezaca.blad ? <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{biezaca.blad}</p> : null}

      <section className="rounded-2xl border border-white/10 bg-black/30">
        <h2 className="border-b border-white/10 px-4 py-3 text-sm font-bold uppercase tracking-wide text-white">
          {aktywna === "moje" ? `Twoje wnioski — ${wnioski(moje.wiersze.length)}` : `Czeka na Twoją decyzję — ${wnioski(doDecyzji.wiersze.length)}`}
        </h2>
        {biezaca.wiersze.length === 0 && !biezaca.blad ? (
          <p className="p-6 text-sm text-muted-foreground">
            {aktywna === "moje" ? "Nie masz jeszcze wniosków." : "Nic nie czeka na decyzję."}
          </p>
        ) : (
          <ul className="divide-y divide-white/5">
            {biezaca.wiersze.map((w) => (
              <Karta
                key={w.id}
                w={w}
                akcje={aktywna === "do-decyzji" ? <DecyzjaWniosku id={w.id} /> : w.status === "PENDING" ? <WycofajWniosek id={w.id} /> : null}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
